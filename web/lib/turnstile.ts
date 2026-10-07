type TurnstileApi = {
 render: (el: HTMLElement, options: Record<string, unknown>) => string;
 execute: (id: string) => void; reset: (id: string) => void; remove: (id: string) => void;
};
declare global { interface Window { turnstile?: TurnstileApi } }

let loader: Promise<TurnstileApi> | null = null;
function loadTurnstile(): Promise<TurnstileApi> {
 loader ||= new Promise((resolve, reject) => {
  if (window.turnstile) return resolve(window.turnstile);
  const script = document.createElement("script");
  script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
  script.async = true;
  script.onload = () => window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile"));
  script.onerror = () => { loader = null; reject(new Error("turnstile")); };
  document.head.appendChild(script);
 });
 return loader;
}

/** Runs an invisible Turnstile check only when the API asks for one; the script is not loaded otherwise. */
export async function getTurnstileToken(siteKey: string, lang: "zh" | "en"): Promise<string> {
 const turnstile = await loadTurnstile();
 const host = document.createElement("div");
 host.className = "turnstile-host";
 document.body.appendChild(host);
 try {
  return await new Promise<string>((resolve, reject) => {
   const id = turnstile.render(host, {
    sitekey: siteKey, size: "flexible", appearance: "interaction-only", language: lang === "zh" ? "zh-cn" : "en",
    callback: (token: string) => resolve(token), "error-callback": () => reject(new Error("turnstile")), "timeout-callback": () => reject(new Error("turnstile")),
   });
   setTimeout(() => reject(new Error("turnstile")), 60_000);
   void id;
  });
 } finally { host.remove(); }
}
