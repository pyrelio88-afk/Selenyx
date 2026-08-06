/**
 * 虚拟模块类型声明
 * 由 vite.config.ts 的 anydocWasmInlinePlugin 在构建时注入
 */
declare module 'virtual:anydoc-wasm-base64' {
  const base64: string;
  export default base64;
}
