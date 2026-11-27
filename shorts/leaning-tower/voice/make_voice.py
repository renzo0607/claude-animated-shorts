import sys, json, subprocess, numpy as np, soundfile as sf
from kokoro_onnx import Kokoro
k = Kokoro("kokoro.onnx", "voices.bin"); voice=sys.argv[1]; segs=json.load(open(sys.argv[2])); out=sys.argv[3]
sr=24000; parts=[]; meta=[]; t=0.0
for i,(txt,sp,pause,gain,pitch,note) in enumerate(segs):
    a,sr=k.create(txt.replace("...", ","), voice=voice, speed=sp, lang="en-us")
    idx=np.where(np.abs(a)>0.01)[0]; a=a[max(idx[0]-1200,0):idx[-1]+480].astype(np.float32)
    if pitch:
        sf.write("/tmp/claude-0/seg.wav",a,sr)
        subprocess.run(["ffmpeg","-loglevel","error","-y","-i","/tmp/claude-0/seg.wav","-af",f"rubberband=pitch={2**(pitch/12):.4f}:formant=preserved","/tmp/claude-0/seg2.wav"],check=True)
        a,_=sf.read("/tmp/claude-0/seg2.wav",dtype="float32")
    a=a*10**(gain/20)
    parts+= [np.zeros(int(pause*sr),np.float32), a]; t+=pause
    meta.append({"text":txt,"start":round(t,3),"end":round(t+len(a)/sr,3),"note":note}); t+=len(a)/sr
parts.append(np.zeros(int(0.3*sr),np.float32))
sf.write(out,np.concatenate(parts),sr); json.dump(meta,open(out.replace(".wav","_lines.json"),"w"),indent=1)
w=sum(len(s[0].split()) for s in segs); print(round(t,2),"s",round(w/t,2),"w/s")
