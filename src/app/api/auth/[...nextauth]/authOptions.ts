import "server-only";

import authConfig from "@/auth.config";

/**
 * Compatibility shim.
 *
 * Some older codepaths (or legacy imports) may still import `authOptions`
 * from this file. Our canonical configuration lives in `src/auth.config.ts`
 * and is exported there as both `authConfig` and default.
 */
export const authOptions = authConfig;
export const authConfigExport = authConfig;

export { authConfig as authConfig };
export default authConfig;
