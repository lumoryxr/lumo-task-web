/**
 * Single source of truth for the legal documents (Terms of Service, Privacy
 * Policy), authored bilingually.
 *
 * Consumed by BOTH the standalone full-page views (`TermsPage`, `PrivacyPage`
 * via `LegalLayout`) AND the in-app `LegalModal` opened from the auth screens,
 * so the prose lives in exactly one place.
 *
 * Long-form prose is kept out of `strings.ts` deliberately: the i18n parity
 * guard covers short UI keys, not multi-paragraph policy text.
 */

/** A single policy section, authored in both locales. */
export interface LegalSection {
  heading: { en: string; zh: string };
  /** One or more paragraphs. */
  body: { en: string[]; zh: string[] };
}

/** A complete legal document: header + intro + ordered sections. */
export interface LegalDoc {
  title: { en: string; zh: string };
  effectiveDate: string;
  intro: { en: string; zh: string };
  sections: LegalSection[];
}

/** Which legal document to show. */
export type LegalDocKey = "terms" | "privacy";

export const TERMS_DOC: LegalDoc = {
  title: { en: "Terms of Service", zh: "服务条款" },
  effectiveDate: "2026-08-08",
  intro: {
    en: "These Terms of Service govern your use of Lumo. Please read them carefully.",
    zh: "本服务条款约束你对 Lumo 的使用，请仔细阅读。",
  },
  sections: [
    {
      heading: { en: "Acceptance of terms", zh: "条款的接受" },
      body: {
        en: ["By creating an account or using Lumo, you agree to these Terms of Service. If you do not agree, do not use the service."],
        zh: ["注册账号或使用 Lumo，即表示你同意本服务条款。若你不同意，请勿使用本服务。"],
      },
    },
    {
      heading: { en: "Your account", zh: "你的账号" },
      body: {
        en: [
          "You are responsible for keeping your account credentials secure and for all activity under your account.",
          "You must provide a valid email address and be legally able to enter into this agreement.",
        ],
        zh: [
          "你有责任妥善保管账号凭据，并对账号下的所有活动负责。",
          "你需提供有效的邮箱地址，并具备签订本协议的法律行为能力。",
        ],
      },
    },
    {
      heading: { en: "Acceptable use", zh: "可接受的使用" },
      body: {
        en: [
          "Do not misuse the service: no attempts to breach security, disrupt the service, or access other users' data.",
          "You retain ownership of the content you create. You are responsible for that content and for how you use any AI features.",
        ],
        zh: [
          "请勿滥用本服务：不得试图破坏安全、干扰服务运行或访问其他用户的数据。",
          "你对所创建的内容保留所有权，并对该内容以及你使用任何 AI 功能的方式负责。",
        ],
      },
    },
    {
      heading: { en: "Service availability", zh: "服务可用性" },
      body: {
        en: [
          "Lumo is provided on an “as is” and “as available” basis during this beta. We may change, suspend, or discontinue features at any time.",
          "We aim to keep your data safe but recommend keeping your own backups via the data export feature.",
        ],
        zh: [
          "在公测期间，Lumo 按“现状”和“可用”基础提供。我们可能随时更改、暂停或停止某些功能。",
          "我们会尽力保障你的数据安全，但仍建议你通过数据导出功能自行备份。",
        ],
      },
    },
    {
      heading: { en: "Limitation of liability", zh: "责任限制" },
      body: {
        en: ["To the maximum extent permitted by law, Lumo is not liable for any indirect or consequential damages arising from your use of the service. Replace this section with counsel-reviewed language before launch."],
        zh: ["在法律允许的最大范围内，Lumo 对因你使用本服务而产生的任何间接或后果性损害不承担责任。上线前请以经法律顾问审阅的条款替换本节。"],
      },
    },
    {
      heading: { en: "Termination", zh: "终止" },
      body: {
        en: ["You may delete your account at any time from Account → Danger zone. We may suspend or terminate accounts that violate these terms."],
        zh: ["你可随时在「账号 → 危险区」删除账号。对于违反本条款的账号，我们可暂停或终止其使用。"],
      },
    },
  ],
};

export const PRIVACY_DOC: LegalDoc = {
  title: { en: "Privacy Policy", zh: "隐私政策" },
  effectiveDate: "2026-08-08",
  intro: {
    en: "This Privacy Policy explains what data Lumo collects, how it is used, and the controls you have over it. Lumo is a personal productivity app built around tasks, focus, and habits.",
    zh: "本隐私政策说明 Lumo 收集哪些数据、如何使用，以及你对数据拥有的控制权。Lumo 是一款围绕任务、专注与习惯打造的个人效率应用。",
  },
  sections: [
    {
      heading: { en: "Data we collect", zh: "我们收集的数据" },
      body: {
        en: [
          "Account data: your email address, display name, and a securely hashed password. We never store your password in plain text.",
          "Product data you create: tasks, habits, projects, countdowns, focus sessions, and your app settings.",
          "If you enable an AI feature with your own provider key, that key is encrypted at rest and used only to make requests on your behalf. It is never returned by any API and is not included in your data export.",
        ],
        zh: [
          "账号数据：你的邮箱地址、显示名称，以及经过安全哈希处理的密码。我们绝不明文存储你的密码。",
          "你创建的产品数据：任务、习惯、项目、倒数日、专注记录以及你的应用设置。",
          "若你使用自带的 AI 服务密钥启用 AI 功能，该密钥将加密存储，仅用于代表你发起请求。它不会被任何接口返回，也不包含在你的数据导出中。",
        ],
      },
    },
    {
      heading: { en: "How we use your data", zh: "我们如何使用数据" },
      body: {
        en: [
          "We use your data solely to provide the product: to store and sync your tasks and to power the features you choose to use.",
          "We do not sell your personal data, and we do not use your product content to train models.",
        ],
        zh: [
          "我们仅将你的数据用于提供产品本身：存储与同步你的任务，并驱动你选择使用的功能。",
          "我们不出售你的个人数据，也不会用你的产品内容训练模型。",
        ],
      },
    },
    {
      heading: { en: "Your rights", zh: "你的权利" },
      body: {
        en: [
          "You can export all of your data at any time from Account → Data & privacy, as a machine-readable JSON file.",
          "You can permanently delete your account and all associated data from Account → Danger zone. Deletion is immediate and irreversible.",
        ],
        zh: [
          "你可随时在「账号 → 数据与隐私」中，将全部数据导出为机器可读的 JSON 文件。",
          "你可在「账号 → 危险区」永久删除账号及全部关联数据。删除立即生效且不可撤销。",
        ],
      },
    },
    {
      heading: { en: "Data storage and third parties", zh: "数据存储与第三方" },
      body: {
        en: [
          "Your data is stored on our hosting and database providers. Add your specific sub-processors (hosting, database, email, and any AI providers) here before launch.",
          "AI requests you initiate are sent to the AI provider you configure; their handling of that data is governed by their own policies.",
        ],
        zh: [
          "你的数据存储在我们的托管与数据库服务商处。上线前请在此列出具体的子处理方（托管、数据库、邮件及任何 AI 服务商）。",
          "你发起的 AI 请求会发送至你所配置的 AI 服务商，其对数据的处理受该服务商自身政策约束。",
        ],
      },
    },
    {
      heading: { en: "Changes to this policy", zh: "本政策的变更" },
      body: {
        en: ["We may update this policy as the product evolves. Material changes will be reflected by the effective date above."],
        zh: ["随着产品演进，我们可能更新本政策。重大变更将通过上方的生效日期体现。"],
      },
    },
  ],
};

/** Lookup table so callers can pick a doc by key. */
export const LEGAL_DOCS: Record<LegalDocKey, LegalDoc> = {
  terms: TERMS_DOC,
  privacy: PRIVACY_DOC,
};
