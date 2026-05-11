// Full-screen triangle / quad vertex shader. We just pass UVs through; the
// fragment shader builds rays from gl_FragCoord directly.

out vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
