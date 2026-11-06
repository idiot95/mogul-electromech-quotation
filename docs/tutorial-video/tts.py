import json, subprocess, urllib.request, os
V="Xb7hH8MSUJpSbSDYk0k2"
scenes=json.load(open("scenes.json")); os.makedirs("audio",exist_ok=True)
out={}
for s in scenes:
    f=f"audio/{s['id']}.mp3"
    if not os.path.exists(f):
        req=urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{V}?output_format=mp3_44100_128",
          data=json.dumps({"text":s["text"],"model_id":"eleven_multilingual_v2","voice_settings":{"stability":0.55,"similarity_boost":0.75,"style":0.15,"speed":0.95}}).encode(),
          headers={"content-type":"application/json","accept":"audio/mpeg"})
        open(f,"wb").write(urllib.request.urlopen(req,timeout=120).read())
    d=float(subprocess.check_output(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",f]).decode())
    out[s["id"]]=round(d,2); print(s["id"],d)
json.dump(out,open("durations.json","w"))
print("total",sum(out.values()))
