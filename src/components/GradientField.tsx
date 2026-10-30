"use client";
import { useEffect, useRef } from "react";

export type RGB = [number, number, number];
export type Palette = { a: RGB; b: RGB; c: RGB };

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0., 1.); }`;
const FRAG = `
precision highp float;
uniform vec2 r; uniform float t; uniform vec2 m; uniform float e;
uniform vec3 A; uniform vec3 B; uniform vec3 C;
float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<5;i++){ v+=a*noise(p); p=p*2.02+vec2(1.7,9.2); a*=.5; } return v; }
float field(vec2 p){
  float s = t*(.05+.1*e);
  vec2 q = vec2(fbm(p*1.1+vec2(0.,s)), fbm(p*1.1+vec2(5.2,1.3)-s));
  float h = fbm(p*1.1 + 2.2*q + vec2(s*.5));
  float d = length(p-m);
  h += .5*exp(-d*d*5.)*(.55+.9*e);
  return h;
}
void main(){
  vec2 p = (gl_FragCoord.xy - .5*r)/r.y;
  float h = field(p);
  float ep = .004;
  vec3 n = normalize(vec3(-(field(p+vec2(ep,0.))-h)/ep*.1, -(field(p+vec2(0.,ep))-h)/ep*.1, 1.));
  vec3 L = normalize(vec3(-.4,.6,.7));
  float diff = clamp(dot(n,L),0.,1.);
  float spec = pow(clamp(dot(reflect(-L,n),vec3(0.,0.,1.)),0.,1.), 26.);
  vec3 base = mix(vec3(.025,.02,.03), A*.85, smoothstep(.3,.62,h));
  base = mix(base, B, smoothstep(.55,.88,h)*.9);
  vec3 col = base*(.4+.95*diff) + C*spec*.5;
  col *= 1. - .6*dot(p,p)*.55;
  col += (h21(gl_FragCoord.xy + t) - .5)*.035;
  gl_FragColor = vec4(col*.82, 1.);
}`;

export default function GradientField({ palette, energy }: { palette: Palette; energy: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const target = useRef({ palette, energy });
  useEffect(() => { target.current = { palette, energy }; }, [palette, energy]);

  useEffect(() => {
    const cv = canvas.current!;
    const gl = cv.getContext("webgl", { antialias: false, alpha: false });
    if (!gl) return; // CSS fallback gradient shows through
    const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = (n: string) => gl.getUniformLocation(prog, n);
    const [uR, uT, uM, uE, uA, uB, uC] = ["r", "t", "m", "e", "A", "B", "C"].map(U);

    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scale = 0.5;
    const resize = () => {
      cv.width = Math.max(2, Math.floor(innerWidth * scale));
      cv.height = Math.max(2, Math.floor(innerHeight * scale));
      gl.viewport(0, 0, cv.width, cv.height);
    };
    resize();
    addEventListener("resize", resize);

    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    const move = (ev: PointerEvent) => { mouse.tx = ev.clientX / innerWidth; mouse.ty = 1 - ev.clientY / innerHeight; };
    addEventListener("pointermove", move);
    mouse.x = mouse.tx = 0.7; mouse.y = mouse.ty = 0.6;

    const cur = { a: [...palette.a], b: [...palette.b], c: [...palette.c], e: energy };
    let raf = 0, last = performance.now(), time = 12;
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const k = 1 - Math.exp(-dt * 3);
      const tg = target.current;
      (["a", "b", "c"] as const).forEach((key) => { for (let i = 0; i < 3; i++) cur[key][i] += (tg.palette[key][i] - cur[key][i]) * k; });
      cur.e += (tg.energy - cur.e) * k;
      mouse.x += (mouse.tx - mouse.x) * (1 - Math.exp(-dt * 4));
      mouse.y += (mouse.ty - mouse.y) * (1 - Math.exp(-dt * 4));
      if (!reduce) time += dt;
      const ar = cv.width / cv.height;
      gl.uniform2f(uR, cv.width, cv.height);
      gl.uniform1f(uT, time);
      gl.uniform2f(uM, (mouse.x - 0.5) * ar, mouse.y - 0.5);
      gl.uniform1f(uE, cur.e);
      gl.uniform3fv(uA, cur.a); gl.uniform3fv(uB, cur.b); gl.uniform3fv(uC, cur.c);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); removeEventListener("resize", resize); removeEventListener("pointermove", move); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <canvas ref={canvas} className="field" aria-hidden />;
}
