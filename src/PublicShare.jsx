import React,{useEffect,useState} from 'react';
import {loadPublicShare} from './journeyApi';

export default function PublicShare({token,renderPortfolio}){
  const [state,setState]=useState({loading:true,data:null,error:''});
  useEffect(()=>{loadPublicShare(token).then(data=>{
    if(!data?.valid) setState({loading:false,data:null,error:'This portfolio link has expired or is no longer available.'});
    else setState({loading:false,data,error:''});
  }).catch(()=>setState({loading:false,data:null,error:'This portfolio link is unavailable.'}))},[token]);
  if(state.loading) return <div className="shareState">Loading portfolio…</div>;
  if(state.error) return <div className="shareState"><h1>Portfolio link unavailable</h1><p>{state.error}</p></div>;
  return renderPortfolio(state.data);
}
