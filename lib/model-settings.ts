export const modelTemplates = [
  {id:"openai",label:"OpenAI",baseUrl:"https://api.openai.com/v1",model:"gpt-4o-mini"},
  {id:"deepseek",label:"DeepSeek",baseUrl:"https://api.deepseek.com/v1",model:"deepseek-chat"},
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

export function modelSettingsError(settings:ModelSettings):string|null{
  if(settings.mode==="site")return null;
  if(!settings.apiKey.trim())return "请先填写个人 API Key。";
  if(/[\r\n]/.test(settings.apiKey))return "API Key 不能包含换行，请重新粘贴。";
  if(settings.mode==="openai-compatible"&&!settings.model.trim())return "请填写要使用的模型名称。";
  return null;
}

export function modelSettingsSummary(settings:ModelSettings):string{
  if(settings.mode==="site")return "站点 Jev";
  if(settings.mode==="jev")return "自己的 Jev";
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
