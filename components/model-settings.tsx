"use client";

import {useState} from "react";
import {ArrowRight,KeyRound,SlidersHorizontal} from "lucide-react";
import {Dialog,DialogTrigger,DialogContent,DialogTitle,DialogDescription} from "@/components/ui/dialog";
import {modelSettingsError,modelTemplates,modelTemplate,type ModelSettings,type ModelTemplateId} from "@/lib/model-settings";

type Props={
  settings:ModelSettings;
  open:boolean;
  onOpenChange:(open:boolean)=>void;
  onApply:(settings:ModelSettings)=>void;
  busy:boolean;
  previewOnly:boolean;
  byokAvailable:boolean|null;
};

function SettingsForm({settings,onApply,busy,previewOnly,byokAvailable,onClose}:Omit<Props,"open"|"onOpenChange">&{onClose:()=>void}){
  const [mode,setMode]=useState<ModelSettings["mode"]>(settings.mode);
  const [template,setTemplate]=useState<ModelTemplateId>(settings.mode==="openai-compatible"?settings.template:"openai");
  const [model,setModel]=useState<string>(settings.mode==="openai-compatible"?settings.model:modelTemplate("openai").model);
  const [apiKey,setApiKey]=useState(settings.mode==="site"?"":settings.apiKey);
  const [error,setError]=useState("");
  const selectedTemplate=modelTemplate(template);
  function apply(){
    if(busy)return;
    const next:ModelSettings=mode==="site"?{mode}:mode==="jev"?{mode,apiKey:apiKey.trim()}:{mode,template,model:model.trim(),apiKey:apiKey.trim()};
    const issue=modelSettingsError(next);
    if(issue){setError(issue);return;}
    onApply(next);onClose();
  }
  return <form className="model-settings-form" onSubmit={event=>{event.preventDefault();apply();}} autoComplete="off">
    <fieldset className="model-mode-group"><legend>选择模型服务</legend>{([
      ["site","站点 Jev","使用站点提供的额度"],
      ["jev","自己的 Jev","使用个人 API Key"],
      ["openai-compatible","OpenAI 兼容","连接所选模型服务"],
    ] as const).map(([value,label,description])=><label key={value} className={mode===value?"is-selected":""}><input type="radio" name="model-service" value={value} checked={mode===value} onChange={()=>{setMode(value);setApiKey("");setError("");}}/><span><strong>{label}</strong><small>{description}</small></span></label>)}</fieldset>
    {mode==="openai-compatible"&&<>
      <label className="model-field"><span>服务模板</span><select value={template} onChange={event=>{const next=event.target.value as ModelTemplateId;setTemplate(next);setModel(modelTemplate(next).model);setApiKey("");setError("");}}>{modelTemplates.map(item=><option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
      <div className="model-endpoint"><span>官方 API 地址</span><code>{selectedTemplate.baseUrl}</code></div>
      <label className="model-field"><span>模型名称</span><input type="text" value={model} onChange={event=>{setModel(event.target.value);setError("");}} placeholder={selectedTemplate.model} spellCheck={false} autoCapitalize="none" maxLength={160}/></label>
    </>}
    {mode!=="site"&&<label className="model-field"><span><KeyRound size={14}/>个人 API Key</span><input type="password" value={apiKey} onChange={event=>{setApiKey(event.target.value);setError("");}} placeholder={mode==="jev"?"粘贴你的 Jev API Key":"粘贴所选服务的 API Key"} autoComplete="off" autoCapitalize="none" spellCheck={false} aria-describedby="model-key-note"/></label>}
    <div className="model-privacy" id="model-key-note"><p>个人密钥仅保留在当前标签页内存，刷新或关闭后清除。推荐时会发送至筛选服务，用于本轮模型调用。</p><p>{mode==="site"?"站点 Jev 共用每日 30 轮额度。切回站点模式会清除已应用的个人密钥。":"个人模型服务的调用费用由你承担；每个个人 Key 独立每日 30 轮。歌曲资料、偏好与最近反馈会交给所选服务筛选。"}</p></div>
    {previewOnly&&<p className="model-service-warning" role="status">当前为静态预览，需连接筛选服务。可以先配置；填写个人 Key 后仍需连接服务才能开始推荐。</p>}
    {!previewOnly&&byokAvailable===false&&mode!=="site"&&<p className="model-service-warning" role="status">此筛选服务暂未开启个人模型。设置可预先保留在本页，开启后才能使用。</p>}
    {error&&<p className="model-settings-error" role="alert">{error}</p>}
    {busy&&<p className="model-service-warning" role="status">本轮正在使用开始时的设置。结束或取消后可应用新设置。</p>}
    <div className="model-settings-actions"><button type="button" className="text-button" onClick={onClose}>取消</button><button type="submit" className="primary-button" disabled={busy}>应用设置<ArrowRight size={16}/></button></div>
  </form>;
}

export function ModelSettingsDialog(props:Props){
  return <Dialog open={props.open} onOpenChange={props.onOpenChange}>
    <DialogTrigger className="about-link model-settings-trigger">模型设置<SlidersHorizontal size={13}/></DialogTrigger>
    <DialogContent className="model-settings-dialog">
      <DialogTitle>选择这次找歌的模型</DialogTitle>
      <DialogDescription>默认使用站点 Jev，也可以连接自己的模型服务。</DialogDescription>
      <SettingsForm settings={props.settings} onApply={props.onApply} busy={props.busy} previewOnly={props.previewOnly} byokAvailable={props.byokAvailable} onClose={()=>props.onOpenChange(false)}/>
    </DialogContent>
  </Dialog>;
}
