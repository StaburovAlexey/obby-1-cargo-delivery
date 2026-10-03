"""Offline descriptor-only map. No game rendering or GPU claim."""
import json
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
root=Path(__file__).resolve().parent
before=json.loads((root/'before.json').read_text())
after=json.loads((root/'after.json').read_text())
biomes=[('city',-17,3000),('forest',3000,5800),('desert',5800,8500),('snow',8500,11000),('volcanic',11000,15850)]
fig,axes=plt.subplots(5,2,figsize=(13,10.8),dpi=140)
fig.patch.set_facecolor('#f7f9fa')
colors={'static':'#25686b','moving':'#d17424'}
for row,(name,start,end) in enumerate(biomes):
 for col,(items,label) in enumerate([(before,'Before'),(after,'After')]):
  ax=axes[row,col];local=[h for h in items if h['biome']==name]
  ax.set_facecolor('#e8edf0');ax.axhline(0,color='#aab4bd',ls='--',lw=.8)
  ax.axhline(-15,color='#72818d',lw=1);ax.axhline(15,color='#72818d',lw=1)
  for h in local:
   moving=bool(h['motion']);color=colors['moving' if moving else 'static'];marker='D' if h['branch']=='alternate' else 'o'
   if moving:ax.plot([h['progress']]*2,[h['motion']['minOffset'],h['motion']['maxOffset']],color=color,alpha=.35,lw=3)
   ax.scatter([h['progress']],[h['offset']],s=29 if col else 23,c=color,marker=marker,linewidths=.5,edgecolors='white',zorder=3)
   if col:
    short=('M' if moving else 'S')+h['id'].split('-')[-1]
    ax.annotate(short,(h['progress'],h['offset']),xytext=(0,7),textcoords='offset points',ha='center',fontsize=7,color='#324552')
  ax.set_xlim(start,end);ax.set_ylim(-18,18);ax.set_yticks([-15,0,15]);ax.tick_params(axis='both',labelsize=8)
  ax.set_title(f"{name.capitalize()} · {len(local)} unique obstacles",loc='left',fontsize=10,weight='semibold',pad=7)
  ax.grid(axis='x',color='white',lw=.65);ax.set_axisbelow(True)
  ax.spines[['top','right','left']].set_visible(False);ax.spines['bottom'].set_color('#aab4bd')
  if col==0:ax.set_ylabel('Lateral offset (m)',fontsize=8)
  if row==4:ax.set_xlabel('Route progress (m)',fontsize=9)
fig.suptitle('Obstacle placement: fewer chains, varied positions',x=.06,ha='left',y=.986,fontsize=17,weight='bold',color='#173240')
fig.text(.06,.95,f'BEFORE · {len(before)} descriptors',fontsize=12,weight='bold',color='#173240')
fig.text(.535,.95,f'AFTER · {len(after)} descriptors',fontsize=12,weight='bold',color='#173240')
fig.legend(handles=[Line2D([],[],marker='o',ls='',color=colors['static'],label='Static obstacle'),Line2D([],[],marker='o',ls='',color=colors['moving'],label='Moving obstacle (line = full sweep)'),Line2D([],[],marker='D',ls='',color='#617483',label='Alternate fork arm')],loc='lower left',bbox_to_anchor=(.05,.043),ncol=3,frameon=False,fontsize=8)
fig.text(.06,.026,'Offline plot of authoritative seed-42 descriptors, one point per unique hazard ID. S/M labels are static/moving ID suffixes.',fontsize=8,color='#526775')
fig.text(.06,.012,'Road is unwrapped: fork arms share progress/offset axes and may overlap. Lateral and longitudinal scales differ. Not a rendered-game view.',fontsize=8,color='#526775')
fig.subplots_adjust(left=.08,right=.98,bottom=.11,top=.92,hspace=.50,wspace=.17)
fig.savefig(root/'layout.png',facecolor=fig.get_facecolor())
print(root/'layout.png')
