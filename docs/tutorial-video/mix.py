import json, re, subprocess
scenes={s["id"]:s for s in json.load(open("scenes.json"))}
durs=json.load(open("durations.json"))
tl=json.load(open("timeline.json"))
LEAD=0.25
inputs=[]; filt=[]
for i,e in enumerate(tl["timeline"]):
    inputs+=["-i",f"audio/{e['id']}.mp3"]
    ms=int((e["t"]+LEAD)*1000)
    filt.append(f"[{i+1}:a]adelay={ms}|{ms}[a{i}]")
n=len(tl["timeline"])
filt.append("".join(f"[a{i}]" for i in range(n))+f"amix=inputs={n}:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[aout]")
# subtitles
def chunks(text):
    parts=re.split(r'(?<=[.!?])\s+',text.strip())
    out=[]
    for p in parts:
        if len(p)<=95: out.append(p); continue
        words=p.split(); cur=""
        # split long sentences at commas near the middle, else by words
        segs=re.split(r'(?<=,)\s+',p); buf=""
        for s in segs:
            if len(buf)+len(s)+1>95 and buf: out.append(buf); buf=s
            else: buf=(buf+" "+s).strip()
        if buf: out.append(buf)
    return out
def ts(t):
    h=int(t//3600); m=int(t%3600//60); s=t%60
    return f"{h:d}:{m:02d}:{s:05.2f}"
srt=[]; k=1
for e in tl["timeline"]:
    s=scenes[e["id"]]; d=durs[e["id"]]; cs=chunks(s["text"])
    tot=sum(len(c) for c in cs); t=e["t"]+LEAD
    for c in cs:
        dt=d*len(c)/tot
        srt.append(f"Dialogue: 0,{ts(t)},{ts(t+dt-0.05)},Sub,,0,0,0,,{c}"); k+=1; t+=dt
hdr="""[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Sub,Inter,38,&H00FFFFFF,&H00FFFFFF,&HB4000000,&HB4000000,0,0,0,0,100,100,0,0,3,10,0,2,360,80,36,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
open("tutorial.ass","w").write(hdr+"\n".join(srt)+"\n")
style="FontName=Inter,FontSize=17,PrimaryColour=&H00FFFFFF,BackColour=&H99000000,BorderStyle=4,Outline=0,Shadow=0,MarginV=22,MarginL=260,MarginR=40,Bold=0"
cmd=["ffmpeg","-y","-loglevel","error","-i","raw.mp4",*inputs,"-filter_complex",";".join(filt)+";[0:v]scale=1920:1080:flags=lanczos,ass=tutorial.ass[vout]",
     "-map","[vout]","-map","[aout]","-c:v","libx264","-preset","slow","-crf","20","-pix_fmt","yuv420p","-c:a","aac","-b:a","160k","-ar","48000","-movflags","+faststart","Mogul-Workspace-Tutorial.mp4"]
subprocess.run(cmd,check=True)
# no-subtitle version too
cmd2=["ffmpeg","-y","-loglevel","error","-i","raw.mp4",*inputs,"-filter_complex",";".join(filt),"-map","0:v","-map","[aout]","-vf","scale=1920:1080:flags=lanczos","-c:v","libx264","-preset","slow","-crf","20","-pix_fmt","yuv420p","-c:a","aac","-b:a","160k","-ar","48000","-movflags","+faststart","Mogul-Workspace-Tutorial-no-subtitles.mp4"]
subprocess.run(cmd2,check=True)
print("ok")
