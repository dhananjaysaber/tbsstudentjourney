// SUPABASE EDGE FUNCTION: journey-public
// Serves a student's portfolio for a secure public link (/p/<token>).
// Shows the same content a signed-in TBS member sees: public, verified
// moments and public evidence; the "about" profile when profile_public is on;
// the approved coach quote; published Academic awards; and the Panthers record
// (raw rows, built in the browser exactly as for members).
// Privacy: other students' IDs are masked and staff emails are never sent.
// School settings are respected (team_ranking off → no ratings sent).
// Deploy: supabase functions deploy journey-public --no-verify-jwt
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'};
const json=(b:any,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...cors,'content-type':'application/json','cache-control':'no-store'}});
function hex(bytes:Uint8Array){return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')}
async function hash(s:string){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))))}

async function rows(q:any){try{const {data,error}=await q;return error?[]:(data||[])}catch{return []}}

/* Same reads as the app's fetchPanthersRows(), with the service role. */
async function panthersRows(db:SupabaseClient, sid:string){
  const [memberships,rewards,monthAwards]=await Promise.all([
    rows(db.from('team_members').select('team_id,student_id,active,joined_date,left_date').eq('student_id',sid)),
    rows(db.from('student_rewards').select('id,student_id,team_id,reward_type,reward_title,reward_comment,comment,reward_date,occurrence_date,awarded_at,awarded_by_email').eq('student_id',sid).eq('active',true).eq('visible_to_parent_student',true)),
    rows(db.from('players_of_month').select('id,student_id,team_id,month_key,recognition_type,selected_at').eq('student_id',sid).eq('active',true)),
  ]);
  const writers=[...new Set(rewards.filter((r:any)=>String(r.reward_comment||r.comment||'').trim()&&r.awarded_by_email).map((r:any)=>String(r.awarded_by_email).toLowerCase()))];
  const people=writers.length?await rows(db.from('app_users').select('email,full_name').in('email',writers)):[];
  const nameOf=new Map(people.map((p:any)=>[String(p.email||'').toLowerCase(),String(p.full_name||'').trim()]));
  rewards.forEach((r:any)=>{r.awarded_by_name=nameOf.get(String(r.awarded_by_email||'').toLowerCase())||'';delete r.awarded_by_email;});

  const teamIds=[...new Set([...memberships,...rewards,...monthAwards].map((r:any)=>r.team_id).filter(Boolean))];
  const empty={memberships,rewards,monthAwards,teams:[],attendance:[],squads:[],results:[],reports:[],schedules:[],playerRatings:[]};
  if(!teamIds.length)return empty;

  const [teams,attendance,squads,results,reports,schedules,playerRatings]=await Promise.all([
    rows(db.from('teams').select('team_id,team_name,activity,category,gender,club,team_image_url,team_banner_url,team_description,active').in('team_id',teamIds)),
    rows(db.from('schedule_attendance').select('schedule_id,occurrence_date,team_id,student_id,attendance_status,active').eq('student_id',sid).eq('active',true).in('team_id',teamIds)),
    rows(db.from('game_squad').select('schedule_id,occurrence_date,team_id,student_id,squad_status,position_or_role,visible_to_parents,publication_status,published_at,active').eq('student_id',sid).eq('active',true).in('team_id',teamIds)),
    rows(db.from('game_results').select('schedule_id,occurrence_date,team_id,opponent_name,our_score,opponent_score,result_status,player_of_match_student_id,match_summary,published_to_parents,active,score_display').eq('active',true).eq('published_to_parents',true).in('team_id',teamIds)),
    rows(db.from('student_progress_reports').select('id,student_id,team_id,report_title,report_period,commitment_summary,strengths,areas_for_development,coach_comment,next_steps,report_date,visible_to_parent_student,active').eq('student_id',sid).eq('active',true).eq('visible_to_parent_student',true).in('team_id',teamIds)),
    rows(db.from('schedules').select('schedule_id,team_id,title,event_type,event_date,start_time,location,schedule_status,active').eq('active',true).in('team_id',teamIds)),
    rows(db.from('player_ratings').select('student_id,team_id,schedule_id,occurrence_date,points,criteria,rated_at,active').eq('active',true).in('team_id',teamIds)),
  ]);

  // School setting: team ranking off → no rating data leaves the server.
  const {data:rankSetting}=await db.from('portfolio_settings').select('value').eq('key','team_ranking').maybeSingle();
  if(rankSetting?.value==='off')playerRatings.length=0;

  // Mask other students: ratings keep a stable stand-in (needed for the team rank).
  const alias=new Map<string,string>();
  const mask=(id:any)=>{const k=String(id||'');if(!k||k===sid)return k;if(!alias.has(k))alias.set(k,`p${alias.size+1}`);return alias.get(k)!;};
  playerRatings.forEach((r:any)=>{r.student_id=mask(r.student_id);});
  results.forEach((r:any)=>{if(r.player_of_match_student_id&&r.player_of_match_student_id!==sid)r.player_of_match_student_id=null;});

  return {memberships,rewards,monthAwards,teams,attendance,squads,results,reports,schedules,playerRatings};
}

Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  try{
    const token=new URL(req.url).searchParams.get('token')||'';if(token.length<20)return json({valid:false,error:'Invalid portfolio token'},400);
    const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);const tokenHash=await hash(token);
    const {data:share,error:se}=await admin.from('student_journey_sharing').select('*').eq('share_token_hash',tokenHash).eq('public_profile_enabled',true).is('revoked_at',null).gt('expires_at',new Date().toISOString()).order('created_at',{ascending:false}).limit(1).maybeSingle();
    if(se)throw se;if(!share)return json({valid:false,error:'This portfolio link has expired or is no longer available.'},404);
    const studentId=share.student_id;
    const [student,profile,entries,evidence]=await Promise.all([
      admin.from('students').select('student_id,full_name,year_group,profile_photo_url').eq('student_id',studentId).eq('active',true).maybeSingle(),
      admin.from('student_journey_profiles').select('preferred_name,headline,about_me,interests,strengths,languages,goals,aspirations,proud_moment,closing_thought,profile_photo_url,banner_image_url,profile_public').eq('student_id',studentId).maybeSingle(),
      // Moments approved by TBS are stored as 'verified' (older rows: 'approved').
      admin.from('student_journey_entries').select('id,student_id,entry_type,domain,title,event_date,end_date,organisation,level,description,reflection,skills,is_featured,verification_status,is_public,display_order').eq('student_id',studentId).eq('active',true).is('deleted_at',null).eq('is_public',true).in('verification_status',['approved','verified']).order('event_date',{ascending:true}),
      admin.from('student_journey_evidence').select('id,entry_id,student_id,evidence_type,media_provider,media_url,thumbnail_url,youtube_video_id,file_name,caption,mime_type,sort_order,drive_file_id,is_public,media_role,created_at').eq('student_id',studentId).eq('active',true).eq('is_public',true).order('sort_order',{ascending:true}),
    ]);
    const failed=[student,profile,entries,evidence].find(x=>x.error);if(failed?.error)throw failed.error;

    const [admission,quote,schoolAwards,panthers]=await Promise.all([
      admin.from('students').select('admission_date').eq('student_id',studentId).maybeSingle(),
      admin.from('student_coach_quotes').select('quote_text,team_id,reviewed_by_name,reviewed_by_role,reviewed_at').eq('student_id',studentId).eq('status','approved').eq('active',true).order('reviewed_at',{ascending:false}).limit(1),
      admin.from('award_nominations').select('id,award_id,category,option_label,term,academic_year,focus,reason,reviewed_at,entered_at,entered_by_name,awards(name,show_on_portfolio,options,choose_first)').eq('student_id',studentId).eq('status','approved').eq('published_to_portfolio',true).order('academic_year',{ascending:false}),
      panthersRows(admin,studentId),
    ]);

    return json({
      valid:true,
      expires_at:share.expires_at,
      student:student.data?{...student.data,admission_date:admission.error?null:admission.data?.admission_date||null}:null,
      profile:profile.data?.profile_public?profile.data:null,
      approvedQuote:quote.error?null:quote.data?.[0]||null,
      schoolAwards:schoolAwards.error?[]:(schoolAwards.data||[]).filter((r:any)=>r.awards?.show_on_portfolio!==false),
      panthersRows:panthers,
      entries:entries.data||[],
      evidence:evidence.data||[]
    });
  }catch(e){console.error('journey-public',e);return json({valid:false,error:'This portfolio could not be loaded.'},400)}
});
