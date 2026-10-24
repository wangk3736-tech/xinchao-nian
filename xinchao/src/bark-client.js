// 【连接桥与推送】Bark 推送客户端：给人的手机发通知（iOS）。不用 Bark 可以不配。
// 代码地图见 src/README.md。
//
// 本部署改动：敲门模式（BARK_KNOCK_MODE=true）。
// 心潮照常生成念头/梦的通知文字并在内部记录（去重、回流都不变），
// 但发到手机上的只是一句固定的"敲门"，不替她说话——话等她在窗口里自己说。

const DEFAULT_KNOCKS = {
  autonomous_thought: '程曦想你了',
  dream: '程曦有话想说',
  daytime_emergence: '程曦有话想说',
};

export function knockText(kind, env = process.env) {
  const byKind = {
    autonomous_thought: env.BARK_KNOCK_LONGING,
    dream: env.BARK_KNOCK_DREAM ?? env.BARK_KNOCK_TALK,
    daytime_emergence: env.BARK_KNOCK_TALK,
  };
  return String(byKind[kind] || DEFAULT_KNOCKS[kind] || env.BARK_KNOCK_TALK || DEFAULT_KNOCKS.dream).trim();
}

export class BarkClient {
  constructor(config, env = process.env) {
    this.config = config;
    this.env = env;
    this.knockMode = /^(1|true|yes|on)$/i.test(String(env.BARK_KNOCK_MODE ?? '').trim());
  }

  async send(body, title = this.config.title, kind = '') {
    if (!this.config.enabled || !this.config.key) return { sent: false, reason: 'disabled' };
    const outgoing = this.knockMode ? knockText(kind, this.env) : body;
    const response = await fetch(`${this.config.server}/${encodeURIComponent(this.config.key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        body: outgoing,
        group: this.config.group,
        icon: this.config.icon,
        sound: this.config.sound,
        level: this.config.level
      }),
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error(`Bark failed: HTTP ${response.status}`);
    return { sent: true, knock: this.knockMode };
  }
}
