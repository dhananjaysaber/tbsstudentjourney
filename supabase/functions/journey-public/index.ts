// SUPABASE EDGE FUNCTION: journey-public
// Serves a student's portfolio for a secure public link (/p/<token>).
// Only public, approved/verified moments and public evidence; the "about"
// profile only when profile_public is on.
// Deploy: supabase functions deploy journey-public --no-verify-jwt
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'};
const json=(b:any,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...cors,'content-type':'application/json','cache-control':'no-store'}});
function hex(bytes:Uint8Array){return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')}
async function hash(s:string){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))))}
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
    return json({valid:true,expires_at:share.expires_at,student:student.data,profile:profile.data?.profile_public?profile.data:null,entries:entries.data||[],evidence:evidence.data||[]});
  }catch(e){console.error('journey-public',e);return json({valid:false,error:'This portfolio could not be loaded.'},400)}
});
