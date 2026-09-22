import fs from 'node:fs';import crypto from 'node:crypto';
const p='src/data-fallback.json',raw=fs.readFileSync(p),j=JSON.parse(raw);if(crypto.createHash('sha256').update(raw).digest('hex')!=='5f16b544ecabd544b3ba2a0ba3e650cab20bce32e121cc728a6aa510aa4c993e')throw Error('data checksum');
const n=Object.values(j.fallback_tables).reduce((a,x)=>a+x.length,0);if(j.record_count!==254||n!==247||j.media.length!==29)throw Error('counts');
let bytes=0;for(const m of j.media){const f='public/fallback-media/'+m.path,b=fs.readFileSync(f);bytes+=b.length;if(b.length!==m.bytes||crypto.createHash('sha256').update(b).digest('hex')!==m.sha256)throw Error('media '+m.path)}if(bytes!==22132497)throw Error('media bytes');console.log({source:j.record_count,included:n,media:j.media.length,bytes});
