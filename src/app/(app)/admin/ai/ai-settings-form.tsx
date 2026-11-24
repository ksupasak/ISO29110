"use client";

import { useActionState, useState, useTransition } from "react";
import Button from "react-bootstrap/Button";
import {
  listLocalModelsAction,
  saveAiSettingsAction,
  testAiConnectionAction,
  type AiFormState,
} from "@/features/ai/actions";
import type { AiProvider, AiSettingsView } from "@/features/ai/settings";
import { FloatingField, FloatingSelect } from "@/components/form-fields";
import { Icon } from "@/components/icon";

// Mirrors CLAUDE_MODELS in src/features/ai/settings.ts; the server re-validates on save.
const CLAUDE_MODELS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-fable-5-2"];
const CLAUDE_WARNING = "เมื่อใช้ Claude เนื้อหาเอกสารจะถูกส่งออกนอกเครือข่ายของบริษัทไปยัง Anthropic";
const KEY_UNREADABLE = "API key เดิมอ่านไม่ได้ (SETTINGS_SECRET เปลี่ยน) กรุณาตั้งใหม่";
const NO_SECRET = "ยังไม่ได้ตั้งค่า SETTINGS_SECRET ที่ server จึงบันทึก API key ไม่ได้";

type Probe = { ok: true; text: string; model: string; ms: number } | { ok: false; error: string };

export function AiSettingsForm({ view: initial, secretReady }: { view: AiSettingsView; secretReady: boolean }) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [provider, setProvider] = useState<AiProvider>(initial.provider);
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl);
  const [localModel, setLocalModel] = useState(initial.provider === "local" ? initial.model : "");
  const [claudeModel, setClaudeModel] = useState(
    initial.provider === "anthropic" && CLAUDE_MODELS.includes(initial.model) ? initial.model : CLAUDE_MODELS[0],
  );
  const [apiKey, setApiKey] = useState("");
  const [clearKey, setClearKey] = useState(false);

  const [state, formAction, saving] = useActionState(async (prev: AiFormState, fd: FormData) => {
    const next = await saveAiSettingsAction(prev, fd);
    if (next.ok) {
      setApiKey("");
      setClearKey(false);
    }
    return next;
  }, {} as AiFormState);
  const view = state.view ?? initial;

  const [models, setModels] = useState<string[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [listing, startList] = useTransition();
  const [probe, setProbe] = useState<Probe | null>(null);
  const [testing, startTest] = useTransition();

  function fetchModels() {
    setListError(null);
    startList(async () => {
      const r = await listLocalModelsAction(baseUrl, apiKey);
      if (r.ok) setModels(r.data);
      else {
        setModels([]);
        setListError(r.error);
      }
    });
  }

  function runTest() {
    setProbe(null);
    startTest(async () => {
      const r = await testAiConnectionAction();
      setProbe(r.ok ? { ok: true, ...r.data } : { ok: false, error: r.error });
    });
  }

  const keyText =
    view.keyState === "set"
      ? `ตั้งค่าแล้ว (ลงท้าย ••••${view.keyHint ?? ""})`
      : view.keyState === "unreadable"
        ? KEY_UNREADABLE
        : "ยังไม่ได้ตั้ง";

  return (
    <form action={formAction} className="d-grid gap-3">
      {!secretReady && (
        <div role="alert" className="alert alert-warning py-2 small mb-0">
          {NO_SECRET}
        </div>
      )}

      <div className="form-check form-switch">
        <input
          id="enabled"
          name="enabled"
          type="checkbox"
          role="switch"
          className="form-check-input"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        <label htmlFor="enabled" className="form-check-label">เปิดใช้ AI</label>
      </div>

      <FloatingSelect id="provider" label="ผู้ให้บริการ" value={provider} onChange={(e) => setProvider(e.target.value as AiProvider)}>
        <option value="local">Local / OpenAI-compatible</option>
        <option value="anthropic">Claude (Anthropic)</option>
      </FloatingSelect>

      {provider === "anthropic" && (
        <div role="note" className="alert alert-warning py-2 small mb-0">
          {CLAUDE_WARNING}
        </div>
      )}

      {provider === "local" && (
        <FloatingField
          id="baseUrl"
          label="URL ปลายทาง"
          placeholder="http://192.168.1.50:11434/v1"
          inputMode="url"
          autoComplete="off"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
        />
      )}

      <div>
        <FloatingField
          id="apiKey"
          label="API key"
          type="password"
          autoComplete="new-password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          aria-describedby="apiKeyState"
        />
        <div id="apiKeyState" className="form-text d-flex flex-wrap align-items-center gap-3">
          <span>{keyText}</span>
          {view.keyState !== "none" && (
            <span className="form-check mb-0">
              <input
                id="clearKey"
                name="clearKey"
                type="checkbox"
                className="form-check-input"
                checked={clearKey}
                onChange={(e) => setClearKey(e.target.checked)}
              />
              <label htmlFor="clearKey" className="form-check-label">ลบ API key</label>
            </span>
          )}
        </div>
      </div>

      {provider === "anthropic" ? (
        <FloatingSelect id="model" label="Model" value={claudeModel} onChange={(e) => setClaudeModel(e.target.value)}>
          {CLAUDE_MODELS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </FloatingSelect>
      ) : (
        <div className="d-grid gap-2">
          <FloatingField
            id="model"
            label="Model"
            list="modelOptions"
            autoComplete="off"
            value={localModel}
            onChange={(e) => setLocalModel(e.target.value)}
          />
          <datalist id="modelOptions">
            {models.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          <div className="d-flex flex-wrap align-items-center gap-2">
            <Button type="button" variant="outline-secondary" size="sm" onClick={fetchModels} disabled={listing || !baseUrl.trim()}>
              <Icon name="list" /> ดึงรายชื่อ model
            </Button>
            {models.length > 0 && <span className="small text-body-secondary">พบ {models.length} model</span>}
          </div>
          {listError && <div role="alert" className="alert alert-danger py-2 small mb-0">{listError}</div>}
        </div>
      )}

      {state.error && <div role="alert" className="alert alert-danger py-2 small mb-3">{state.error}</div>}
      {state.ok && <div role="status" className="alert alert-success py-2 small mb-3">บันทึกแล้ว</div>}

      <div className="d-flex flex-wrap gap-2">
        <Button type="submit" variant="primary" disabled={saving}>บันทึก</Button>
        <Button type="button" variant="outline-primary" onClick={runTest} disabled={testing}>
          <Icon name="network_check" /> ทดสอบการเชื่อมต่อ
        </Button>
      </div>
      <div className="form-text mt-0">ปุ่มทดสอบใช้ค่าที่บันทึกไว้แล้ว</div>

      {probe && !probe.ok && <div role="alert" className="alert alert-danger py-2 small mb-3">{probe.error}</div>}
      {probe?.ok && (
        <div role="status" className="alert alert-success py-2 small mb-3" data-testid="ai-test-result">
          <div>{probe.text}</div>
          <div className="text-body-secondary">Model: {probe.model} · {probe.ms} ms</div>
        </div>
      )}
    </form>
  );
}
