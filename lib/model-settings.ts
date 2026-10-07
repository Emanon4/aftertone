// Defaults reviewed 2026-10: deepseek-chat was retired on 2026-07-24 in favour of deepseek-v4-flash.
// OpenAI keeps a non-reasoning model because the adapter sends temperature and max_tokens.
export const modelTemplates = [
  {id:"openai",label:"OpenAI",baseUrl:"https://api.openai.com/v1",model:"gpt-4.1-mini"},
  {id:"deepseek",label:"DeepSeek",baseUrl:"https://api.deepseek.com/v1",model:"deepseek-v4-flash"},
  {id:"qwen-cn",label:"Qwen 国内",baseUrl:"https://dashscope.aliyuncs.com/compatible-mode/v1",model:"qwen-plus"},
  {id:"qwen-intl",label:"Qwen 国际",baseUrl:"https://dashscope-intl.aliyuncs.com/compatible-mode/v1",model:"qwen-plus"},
] as const;

export type ModelTemplateId = typeof modelTemplates[number]["id"];
export type ModelSettings =
  | {mode:"site"}
  | {mode:"jev";apiKey:string}
  | {mode:"openai-compatible";template:ModelTemplateId;model:string;apiKey:string};

export function modelTemplate(id:ModelTemplateId){
  return modelTemplates.find(template=>template.id===id)!;
}

export type ModelSettingsIssue="model.err.key"|"model.err.newline"|"model.err.name";
/** Returns a message key so the UI can show it in the current language. */
export function modelSettingsError(settings:ModelSettings):ModelSettingsIssue|null{
  if(settings.mode==="site")return null;
  if(!settings.apiKey.trim())return "model.err.key";
  if(/[\r\n]/.test(settings.apiKey))return "model.err.newline";
  if(settings.mode==="openai-compatible"&&!settings.model.trim())return "model.err.name";
  return null;
}

/** Template label and model name, or null for the two Jev modes (translated by the UI). */
export function modelSettingsSummary(settings:ModelSettings):string|null{
  if(settings.mode!=="openai-compatible")return null;
  return `${modelTemplate(settings.template).label} · ${settings.model.trim()}`;
}

// Create a per-job snapshot. API keys never enter the JSON payload or browser storage.
export function modelRequestSnapshot(settings:ModelSettings):{
  headers:Record<string,string>;
  modelConfig?:{provider:"jev"|"openai-compatible";baseUrl?:string;model?:string};
}{
  const issue=modelSettingsError(settings);
  if(issue)throw new Error(issue);
  const headers:Record<string,string>={"Content-Type":"application/json"};
  if(settings.mode==="site")return {headers};
  headers["X-Model-Api-Key"]=settings.apiKey.trim();
  return {
    headers,
    modelConfig:settings.mode==="jev"?{provider:"jev"}:{
      provider:"openai-compatible",
      baseUrl:modelTemplate(settings.template).baseUrl,
      model:settings.model.trim(),
    },
  };
}
