/* App Router project — hard-ban `next/document` at type level.
   If anything imports it, JSX usage will fail (values typed as `never`). */
declare module "next/document" {
  // Any attempt to use these will be a type error
  export const Html: never;
  export const Head: never;
  export const Main: never;
  export const NextScript: never;
  const _default: never;
  export default _default;
}
