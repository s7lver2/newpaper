/// Los logos de proveedor se importan como texto (`?raw`): lo resuelve Vite en las apps.
declare module '*.svg?raw' {
  const src: string;
  export default src;
}
