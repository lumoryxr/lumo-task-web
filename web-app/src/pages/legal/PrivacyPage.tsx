import { LegalLayout, type LegalSection } from "./LegalLayout";

const SECTIONS: LegalSection[] = [
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
];

export function PrivacyPage() {
  return (
    <LegalLayout
      title={{ en: "Privacy Policy", zh: "隐私政策" }}
      effectiveDate="2026-08-08"
      intro={{
        en: "This Privacy Policy explains what data Lumo collects, how it is used, and the controls you have over it. Lumo is a personal productivity app built around tasks, focus, and habits.",
        zh: "本隐私政策说明 Lumo 收集哪些数据、如何使用，以及你对数据拥有的控制权。Lumo 是一款围绕任务、专注与习惯打造的个人效率应用。",
      }}
      sections={SECTIONS}
    />
  );
}
