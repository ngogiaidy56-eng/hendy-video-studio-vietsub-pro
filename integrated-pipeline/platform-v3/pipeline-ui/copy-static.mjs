import { cp, mkdir } from "node:fs/promises";
const out = "../webApp/build/dist/js/productionExecutable";
await mkdir(out, { recursive: true });
await cp("public/tai-app.html", `${out}/tai-app.html`);
await cp("../webApp/_redirects", `${out}/_redirects`);
await cp("../webApp/_headers", `${out}/_headers`);
