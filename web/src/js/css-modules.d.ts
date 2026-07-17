// Ambient declaration so TypeScript (tsc / tsgo) can type CSS Module imports.
declare module "*.module.css" {
    const classes: Readonly<Record<string, string>>;
    export default classes;
}
