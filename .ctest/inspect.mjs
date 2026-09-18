const { signInEmail, getSession, supabase } = await import('./cloud.mjs')
await signInEmail('bot-teste-nebulatune@example.com','teste123456')
const { user } = await getSession()
const root = await supabase.storage.from('backups').list(user.id, { limit: 100 })
console.log('root:', root.data?.map(x=>({name:x.name,id:x.id,updated:x.updated_at})))
const idx = await supabase.storage.from('backups').download(`${user.id}/index.json`)
if (idx.data) { const j = JSON.parse(await idx.data.text()); console.log('index v', j.v, 'tracks', j.tracks?.length, 'updatedAt', j.updatedAt) }
else console.log('sem index:', idx.error?.message)
