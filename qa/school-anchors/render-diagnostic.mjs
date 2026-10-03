// Geometry-only SVG diagnostic. No browser, screenshots or gameplay rendering.
import fs from 'node:fs';
const rows=JSON.parse(fs.readFileSync(new URL('./projection-specimens.json',import.meta.url),'utf8'));
const samples=[['published32-east-side','Published32: side view','148 px maximum anchor drift'],['east-side','Fixed: side view','School 5 nearest; other labels behind'],['west-side','Fixed: opposite side','School 1 nearest; other labels behind']];
const colors=['#79c46c','#55b9d0','#7393e9','#ad86d3','#e9ad5e'];
let svg='<svg xmlns="http://www.w3.org/2000/svg" width="1260" height="390" viewBox="0 0 1260 390"><rect width="1260" height="390" fill="#101b2a"/><g font-family="DejaVu Sans,sans-serif" fill="#eef3fb"><text x="24" y="35" font-size="22" font-weight="bold">School labels: exact projection and depth</text><text x="24" y="61" font-size="14" fill="#afbfce">Geometry diagram from actual Three.js/app measurements. Not a gameplay screenshot.</text>';
for(const [index,[name,title,note]]of samples.entries()){
  const sample=rows.find(r=>r.name===name),left=24+index*412,top=90,baseline=index===0;
  svg+=`<g transform="translate(${left} ${top})"><rect width="390" height="246" rx="12" fill="#1c2b3f"/><text x="14" y="28" font-size="18" font-weight="bold">${title}</text><text x="14" y="50" font-size="12" fill="#afbfce">390 px viewport · unchanged scale 0.583</text><line x1="195" y1="66" x2="195" y2="193" stroke="#f1f4fa" stroke-width="1" stroke-dasharray="3 4"/>`;
  if(baseline)for(const row of sample.rows)svg+=`<line x1="195" y1="190" x2="${row.x}" y2="176" stroke="#f2757e" stroke-width="1.5" stroke-dasharray="3 3"/>`;
  for(const row of [...sample.rows].sort((a,b)=>(a.zIndex||0)-(b.zIndex||0))){
    svg+=`<rect x="${row.x-35}" y="101.3333" width="70" height="74.6667" fill="${colors[row.school-1]}" stroke="#ecf3fc" stroke-width="1.4" rx="3"/><text x="${row.x}" y="146" text-anchor="middle" font-size="29" font-weight="bold" fill="#172436">${row.school}</text>`;
  }
  svg+='<path d="M 188 190 L 202 190 M 195 183 L 195 197" stroke="#fff" stroke-width="2"/><text x="195" y="213" text-anchor="middle" font-size="12" fill="#c2cfdf">All five true anchors: X = 195 px</text>';
  svg+=`<text x="195" y="234" text-anchor="middle" font-size="12" fill="${baseline?'#ff9da5':'#b9e9ba'}">${note}</text></g>`;
}
svg+='<text x="24" y="368" font-size="13" fill="#afbfce">Colored boxes represent 120 × 128 label bounds after scaling. Artwork and floating animation are intentionally omitted.</text></g></svg>';
fs.writeFileSync(new URL('./anchor-diagnostic.svg',import.meta.url),svg+'\n');
console.log('Wrote qa/school-anchors/anchor-diagnostic.svg (geometric diagnostic only).');
