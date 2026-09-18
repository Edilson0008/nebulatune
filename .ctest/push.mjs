globalThis.FileReader = class { readAsDataURL(b){ b.arrayBuffer().then((buf)=>{ this.result=`data:${b.type};base64,${Buffer.from(buf).toString('base64')}`; this.onload&&this.onload() }) } }
const { signInEmail, getSession, pushBackup } = await import('./cloud.mjs')
const d = (m,t)=>`data:${m};base64,${Buffer.from(t).toString('base64')}`
await signInEmail('bot-teste-nebulatune@example.com','teste123456')
const { user } = await getSession()
const backup = { app:'NebulaTune', type:'backup-completo', settings:{volume:0.7}, equalizer:{enabled:false}, lyricSync:{}, tracks:[
  { id:'nuvem-1', title:'Musica da Nuvem', artist:'Teste', album:'Album', duration:123, cover:['#a1c','#2af'], fav:true, plays:0, addedAt:1, coverRemote:null, audioData:d('audio/mpeg','NUVEM-AUDIO-'.repeat(400)), coverData:d('image/jpeg','NUVEM-CAPA') },
  { id:'nuvem-2', title:'Segunda da Nuvem', artist:'Teste', album:'Album', duration:99, cover:null, fav:false, plays:0, addedAt:2, coverRemote:null, audioData:d('audio/mpeg','NUVEM-DOIS-'.repeat(200)), coverData:null }
] }
await pushBackup(user.id, backup)
console.log('dados de teste enviados para a nuvem:', user.id)
