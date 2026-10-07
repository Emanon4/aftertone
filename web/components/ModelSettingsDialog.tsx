import { useState } from "react";
import { ArrowRight, KeyRound } from "lucide-react";
import { modelSettingsError, modelTemplate, modelTemplates, type ModelSettings, type ModelTemplateId } from "@/lib/model-settings";
import { useI18n, type MessageKey } from "../lib/i18n";
import { Sheet } from "./primitives";

type Props = { settings: ModelSettings; open: boolean; onOpenChange: (open: boolean) => void; onApply: (settings: ModelSettings) => void; busy: boolean; previewOnly: boolean; byokAvailable: boolean | null };

function SettingsForm({ settings, onApply, busy, previewOnly, byokAvailable, onClose }: Omit<Props, "open" | "onOpenChange"> & { onClose: () => void }) {
 const { t } = useI18n();
 const [mode, setMode] = useState<ModelSettings["mode"]>(settings.mode);
 const [template, setTemplate] = useState<ModelTemplateId>(settings.mode === "openai-compatible" ? settings.template : "openai");
 const [model, setModel] = useState<string>(settings.mode === "openai-compatible" ? settings.model : modelTemplate("openai").model);
 const [apiKey, setApiKey] = useState(settings.mode === "site" ? "" : settings.apiKey);
 const [error, setError] = useState<MessageKey | "">("");
 const selected = modelTemplate(template);
 function apply() {
  if (busy) return;
  const next: ModelSettings = mode === "site" ? { mode } : mode === "jev" ? { mode, apiKey: apiKey.trim() } : { mode, template, model: model.trim(), apiKey: apiKey.trim() };
  const issue = modelSettingsError(next);
  if (issue) { setError(issue); return; }
  onApply(next); onClose();
 }
 const modes: [ModelSettings["mode"], MessageKey, MessageKey][] = [["site", "model.site", "model.site.desc"], ["jev", "model.jev", "model.jev.desc"], ["openai-compatible", "model.compat", "model.compat.desc"]];
 return <form className="model-form" onSubmit={e => { e.preventDefault(); apply(); }} autoComplete="off">
  <fieldset className="model-modes"><legend>{t("model.service")}</legend>
   {modes.map(([value, label, desc]) => <label key={value} className={mode === value ? "on" : ""}>
    <input type="radio" name="model-service" value={value} checked={mode === value} onChange={() => { setMode(value); setApiKey(""); setError(""); }} />
    <span><strong>{t(label)}</strong><small>{t(desc)}</small></span>
   </label>)}
  </fieldset>
  {mode === "openai-compatible" && <>
   <label className="field"><span>{t("model.template")}</span>
    <select value={template} onChange={e => { const next = e.target.value as ModelTemplateId; setTemplate(next); setModel(modelTemplate(next).model); setApiKey(""); setError(""); }}>
     {modelTemplates.map(item => <option value={item.id} key={item.id}>{item.label}</option>)}
    </select></label>
   <div className="field"><span>{t("model.endpoint")}</span><code>{selected.baseUrl}</code></div>
   <label className="field"><span>{t("model.name")}</span><input value={model} onChange={e => { setModel(e.target.value); setError(""); }} placeholder={selected.model} spellCheck={false} autoCapitalize="none" maxLength={160} /></label>
  </>}
  {mode !== "site" && <label className="field"><span><KeyRound size={14} />{t("model.key")}</span>
   <input type="password" value={apiKey} onChange={e => { setApiKey(e.target.value); setError(""); }} placeholder={mode === "jev" ? t("model.key.jev") : t("model.key.compat")} autoComplete="off" autoCapitalize="none" spellCheck={false} aria-describedby="model-key-note" /></label>}
  <div className="model-privacy" id="model-key-note"><p>{t("model.privacy")}</p><p>{mode === "site" ? t("model.site.note") : t("model.personal.note")}</p></div>
  {previewOnly && <p className="model-warn" role="status">{t("model.previewOnly")}</p>}
  {!previewOnly && byokAvailable === false && mode !== "site" && <p className="model-warn" role="status">{t("model.noByok")}</p>}
  {error && <p className="model-error" role="alert">{t(error)}</p>}
  {busy && <p className="model-warn" role="status">{t("model.busy")}</p>}
  <div className="sheet-actions"><button type="button" className="btn btn-soft" onClick={onClose}>{t("model.cancel")}</button><button type="submit" className="btn btn-accent" disabled={busy}>{t("model.apply")}<ArrowRight size={16} /></button></div>
 </form>;
}

export function ModelSettingsDialog(props: Props) {
 const { t } = useI18n();
 return <Sheet open={props.open} onOpenChange={props.onOpenChange} title={t("model.title")} description={t("model.desc")} closeLabel={t("model.cancel")} className="model-sheet">
  <SettingsForm settings={props.settings} onApply={props.onApply} busy={props.busy} previewOnly={props.previewOnly} byokAvailable={props.byokAvailable} onClose={() => props.onOpenChange(false)} />
 </Sheet>;
}
