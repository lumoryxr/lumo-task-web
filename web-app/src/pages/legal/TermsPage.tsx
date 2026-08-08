import { LegalLayout, type LegalSection } from "./LegalLayout";

const SECTIONS: LegalSection[] = [
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
];

export function TermsPage() {
  return (
    <LegalLayout
      title={{ en: "Terms of Service", zh: "服务条款" }}
      effectiveDate="2026-08-08"
      intro={{
        en: "These Terms of Service govern your use of Lumo. Please read them carefully.",
        zh: "本服务条款约束你对 Lumo 的使用，请仔细阅读。",
      }}
      sections={SECTIONS}
    />
  );
}
