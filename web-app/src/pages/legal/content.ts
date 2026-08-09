/**
 * Single source of truth for the legal documents (Terms of Service, Privacy
 * Policy), authored bilingually (en + zh).
 *
 * Consumed by BOTH the standalone full-page views (`TermsPage`, `PrivacyPage`
 * via `LegalLayout`) AND the in-app `LegalModal` opened from the auth screens,
 * so the prose lives in exactly one place.
 *
 * These are production documents tailored to how Lumo actually operates today:
 * a free (donation-supported) personal-productivity product, with data hosted
 * on Turso, transactional email via Resend, optional GitHub sign-in, and
 * bring-your-own-key AI. There is NO paid subscription. If you later
 * incorporate a legal entity or add paid plans, update the operator/contact
 * config (`@/config/app`) and add subscription/refund terms here.
 *
 * Long-form prose is kept out of `strings.ts` deliberately: the i18n parity
 * guard covers short UI keys, not multi-paragraph policy text.
 */

import { GITHUB_URL, CONTACT_URL, CONTACT_EMAIL, OPERATOR_NAME } from "@/config/app";

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

/** Documents share one effective date; bump when the prose materially changes. */
const EFFECTIVE_DATE = "2026-08-09";

/** Contact sentence, built from config so there is one place to change it. */
const CONTACT = {
  en: CONTACT_EMAIL
    ? `Questions? Contact ${OPERATOR_NAME} at ${CONTACT_EMAIL}, or open an issue at ${CONTACT_URL}.`
    : `Questions? Contact ${OPERATOR_NAME} by opening an issue at ${CONTACT_URL}.`,
  zh: CONTACT_EMAIL
    ? `如有疑问，可通过 ${CONTACT_EMAIL} 联系${OPERATOR_NAME}，或在 ${CONTACT_URL} 提交 issue。`
    : `如有疑问，可在 ${CONTACT_URL} 提交 issue 与${OPERATOR_NAME}联系。`,
};

export const TERMS_DOC: LegalDoc = {
  title: { en: "Terms of Service", zh: "服务条款" },
  effectiveDate: EFFECTIVE_DATE,
  intro: {
    en: "These Terms of Service (the “Terms”) govern your access to and use of Lumo (the “Service”). Lumo is a free personal-productivity application for tasks, focus, and habits. By creating an account or using the Service you agree to these Terms; if you do not agree, do not use the Service.",
    zh: "本服务条款（下称“本条款”）约束你对 Lumo（下称“本服务”）的访问与使用。Lumo 是一款免费的个人效率应用，用于任务、专注与习惯管理。注册账号或使用本服务，即表示你同意本条款；若你不同意，请勿使用本服务。",
  },
  sections: [
    {
      heading: { en: "Eligibility and your account", zh: "使用资格与你的账号" },
      body: {
        en: [
          "You must be able to form a binding contract to use the Service, and you must not be barred from doing so under applicable law. The Service is not directed to children under 13 (or the minimum age of digital consent in your jurisdiction).",
          "You are responsible for safeguarding your credentials and for all activity under your account. Notify us promptly if you believe your account has been compromised.",
        ],
        zh: [
          "你须具备签订有约束力合同的能力，且在适用法律下未被禁止使用本服务。本服务不面向 13 周岁以下（或你所在司法辖区规定的数字同意最低年龄以下）的儿童。",
          "你有责任妥善保管账号凭据，并对账号下的一切活动负责。若你认为账号已被盗用，请及时告知我们。",
        ],
      },
    },
    {
      heading: { en: "Acceptable use", zh: "可接受的使用" },
      body: {
        en: [
          "You agree not to misuse the Service. In particular, do not: attempt to breach or probe security or authentication; disrupt or overload the Service; access or tamper with other users’ data; reverse-engineer non-public parts of the Service except as permitted by law; or use the Service to store or transmit unlawful, infringing, or harmful content.",
          "We may suspend or limit access to protect the Service and its users, or to comply with the law.",
        ],
        zh: [
          "你同意不滥用本服务。尤其不得：试图破坏或探测安全与认证机制；干扰或使本服务过载；访问或篡改其他用户的数据；在法律允许之外对本服务的非公开部分进行逆向工程；或利用本服务存储、传输违法、侵权或有害内容。",
          "为保护本服务及其用户或遵守法律，我们可暂停或限制访问。",
        ],
      },
    },
    {
      heading: { en: "Your content and ownership", zh: "你的内容与所有权" },
      body: {
        en: [
          "You retain all rights to the content you create in Lumo (your tasks, notes, habits, projects, and similar data). We claim no ownership of it.",
          "You grant us only the limited permission needed to operate the Service for you — for example, to store, back up, and sync your content to your own devices. You are responsible for the content you create and for having the right to use it.",
        ],
        zh: [
          "你对在 Lumo 中创建的内容（任务、笔记、习惯、项目等数据）保留全部权利。我们不主张对其拥有所有权。",
          "你仅授予我们为你运行本服务所必需的有限许可——例如存储、备份并将你的内容同步到你自己的设备。你对所创建的内容及使用该内容的权利负责。",
        ],
      },
    },
    {
      heading: { en: "AI features (bring your own key)", zh: "AI 功能（自带密钥）" },
      body: {
        en: [
          "Optional AI features work with an API key you provide for a third-party AI provider. When you use them, the relevant content is sent to that provider to fulfill your request; their handling of it is governed by their own terms and privacy policy.",
          "AI output can be inaccurate or incomplete. You are responsible for reviewing it before relying on it. Your API key is encrypted at rest, is never returned by the Service, and is excluded from your data export.",
        ],
        zh: [
          "可选的 AI 功能依赖你自行提供的第三方 AI 服务商 API 密钥。当你使用这些功能时，相关内容会发送至该服务商以完成你的请求；该服务商对数据的处理受其自身条款与隐私政策约束。",
          "AI 输出可能不准确或不完整，你应在依赖前自行审阅。你的 API 密钥加密存储，绝不会被本服务返回，也不包含在你的数据导出中。",
        ],
      },
    },
    {
      heading: { en: "Donations", zh: "捐赠" },
      body: {
        en: [
          "Lumo is free to use. You may optionally support development through a voluntary donation via our GitHub page. Donations are voluntary, are used to support ongoing development, and are non-refundable except where required by law.",
          "A donation does not purchase the Service, does not create a subscription, and confers no additional features, warranties, service levels, or other entitlements. If paid plans are introduced in the future, they will be governed by additional terms presented at that time.",
        ],
        zh: [
          "Lumo 可免费使用。你可以选择通过我们的 GitHub 页面进行自愿捐赠以支持开发。捐赠属自愿性质，用于支持持续开发，除法律另有要求外不予退还。",
          "捐赠并非购买本服务，不构成订阅，也不带来任何额外功能、保证、服务等级或其他权益。若未来推出付费方案，将适用届时另行提供的条款。",
        ],
      },
    },
    {
      heading: { en: "Third-party services", zh: "第三方服务" },
      body: {
        en: [
          "The Service relies on third-party providers (for hosting, database, email delivery, optional sign-in, and any AI provider you configure). We are not responsible for third-party services, and your use of them may be subject to their own terms.",
        ],
        zh: [
          "本服务依赖第三方服务商（用于托管、数据库、邮件投递、可选登录，以及你所配置的任何 AI 服务商）。我们不对第三方服务负责，你对其的使用可能受其自身条款约束。",
        ],
      },
    },
    {
      heading: { en: "Service availability and “as is”", zh: "服务可用性与“现状”提供" },
      body: {
        en: [
          "Lumo is currently offered in beta and is provided on an “as is” and “as available” basis. We may change, suspend, or discontinue features at any time, and we do not guarantee uninterrupted or error-free operation.",
          "To the maximum extent permitted by law, the Service is provided without warranties of any kind, whether express or implied, including implied warranties of merchantability, fitness for a particular purpose, and non-infringement. We strongly recommend keeping your own backups using the data-export feature.",
        ],
        zh: [
          "Lumo 目前处于公测阶段，按“现状”与“可用”基础提供。我们可能随时更改、暂停或停止某些功能，且不保证服务不中断或无差错。",
          "在法律允许的最大范围内，本服务不附带任何明示或默示的保证，包括对适销性、特定用途适用性及不侵权的默示保证。我们强烈建议你使用数据导出功能自行保留备份。",
        ],
      },
    },
    {
      heading: { en: "Limitation of liability", zh: "责任限制" },
      body: {
        en: [
          "To the maximum extent permitted by applicable law, the operators of Lumo will not be liable for any indirect, incidental, special, consequential, or punitive damages, or for any loss of data, profits, or goodwill, arising out of or relating to your use of (or inability to use) the Service.",
          "To the extent liability cannot be excluded, it is limited to the greater of the amount you paid us in the twelve months before the claim (which for a free service is typically zero) or, where applicable law provides a minimum, that minimum. Nothing in these Terms limits liability that cannot be limited under applicable law.",
        ],
        zh: [
          "在适用法律允许的最大范围内，对于因你使用（或无法使用）本服务而产生或与之相关的任何间接、附带、特殊、后果性或惩罚性损害，或任何数据、利润或商誉损失，Lumo 的运营者概不承担责任。",
          "在责任无法排除的范围内，赔偿以下列两者中的较高者为限：你在索赔发生前十二个月内向我们支付的金额（对免费服务通常为零），或适用法律规定的最低限额（如有）。本条款不限制依适用法律不得限制的责任。",
        ],
      },
    },
    {
      heading: { en: "Termination", zh: "终止" },
      body: {
        en: [
          "You may stop using the Service at any time and can permanently delete your account and data from Account → Danger zone. We may suspend or terminate accounts that violate these Terms or to comply with the law.",
        ],
        zh: [
          "你可随时停止使用本服务，并可在“账号 → 危险区”永久删除账号及数据。对于违反本条款或为遵守法律的情形，我们可暂停或终止账号。",
        ],
      },
    },
    {
      heading: { en: "Governing law", zh: "适用法律" },
      body: {
        en: [
          "These Terms are governed by the laws applicable at the operator’s principal place of residence, without regard to conflict-of-law rules, except where mandatory consumer-protection law in your place of residence provides otherwise. Nothing here deprives you of protections you are entitled to under such mandatory law.",
        ],
        zh: [
          "本条款受运营者主要居住地适用法律管辖（不含冲突法规则），但你居住地的强制性消费者保护法另有规定的除外。本条款不剥夺你依该等强制性法律所享有的保护。",
        ],
      },
    },
    {
      heading: { en: "Changes to these terms", zh: "本条款的变更" },
      body: {
        en: [
          "We may update these Terms as the Service evolves. Material changes will be reflected by the effective date above; continued use after an update means you accept the revised Terms.",
        ],
        zh: [
          "随着本服务演进，我们可能更新本条款。重大变更将通过上方生效日期体现；更新后继续使用即表示你接受修订后的条款。",
        ],
      },
    },
    {
      heading: { en: "Contact", zh: "联系我们" },
      body: { en: [CONTACT.en], zh: [CONTACT.zh] },
    },
  ],
};

export const PRIVACY_DOC: LegalDoc = {
  title: { en: "Privacy Policy", zh: "隐私政策" },
  effectiveDate: EFFECTIVE_DATE,
  intro: {
    en: "This Privacy Policy explains what data Lumo collects, how it is used, who processes it, and the control you have over it. Lumo is a personal-productivity app for tasks, focus, and habits. We aim to collect as little as possible and never sell your data.",
    zh: "本隐私政策说明 Lumo 收集哪些数据、如何使用、由谁处理，以及你对数据拥有的控制权。Lumo 是一款用于任务、专注与习惯的个人效率应用。我们力求尽可能少地收集数据，且绝不出售你的数据。",
  },
  sections: [
    {
      heading: { en: "Data we collect", zh: "我们收集的数据" },
      body: {
        en: [
          "Account data: your username, an optional email address, an optional display name, and a securely hashed password. We never store your password in plain text.",
          "Product data you create: tasks, habits, projects, countdowns, focus sessions, people labels, templates, and your app settings.",
          "Optional sign-in: if you sign in with GitHub, we receive your GitHub account identifier and public profile basics to create or link your account. We do not post to GitHub on your behalf.",
          "AI provider key: if you enable AI with your own key, it is encrypted at rest, used only to make requests you initiate, never returned by any API, and excluded from your data export.",
          "Technical data: standard server logs (such as timestamps, request paths, and coarse status information) used to operate and secure the Service. We do not use third-party advertising or cross-site tracking.",
        ],
        zh: [
          "账号数据：你的用户名、可选的邮箱地址、可选的显示名称，以及经安全哈希处理的密码。我们绝不明文存储你的密码。",
          "你创建的产品数据：任务、习惯、项目、倒数日、专注记录、联系人标签、模板以及应用设置。",
          "可选登录：若你使用 GitHub 登录，我们会获取你的 GitHub 账号标识与公开资料基础信息，用于创建或关联账号。我们不会代表你在 GitHub 上发布内容。",
          "AI 服务商密钥：若你使用自带密钥启用 AI，该密钥加密存储，仅用于发起你主动触发的请求，绝不会被任何接口返回，也不包含在数据导出中。",
          "技术数据：用于运行与保护本服务的常规服务器日志（如时间戳、请求路径与粗粒度状态信息）。我们不使用第三方广告或跨站追踪。",
        ],
      },
    },
    {
      heading: { en: "How we use your data", zh: "我们如何使用数据" },
      body: {
        en: [
          "We use your data solely to provide and secure the product: to authenticate you, store and sync your content, send account emails you request (such as verification and password reset), and prevent abuse.",
          "We do not sell your personal data, do not use your product content to train AI models, and do not share it except with the service providers listed below or where required by law.",
        ],
        zh: [
          "我们仅将你的数据用于提供与保护产品：为你进行身份验证、存储与同步内容、发送你所请求的账号邮件（如验证与密码重置）以及防止滥用。",
          "我们不出售你的个人数据，不用你的产品内容训练 AI 模型，除下列服务商或法律要求外亦不与他方共享。",
        ],
      },
    },
    {
      heading: { en: "Legal bases (EEA/UK)", zh: "法律依据（欧洲经济区/英国）" },
      body: {
        en: [
          "Where the GDPR (or UK GDPR) applies, we process account and product data to perform our agreement with you (providing the Service), rely on legitimate interests to keep the Service secure and prevent abuse, and rely on your consent for optional features you switch on (such as AI). You can withdraw consent by turning the feature off.",
        ],
        zh: [
          "在适用 GDPR（或英国 GDPR）的情形下，我们为履行与你的协议（提供本服务）处理账号与产品数据；基于正当利益保障服务安全并防止滥用；并基于你的同意提供你所开启的可选功能（如 AI）。你可通过关闭相应功能撤回同意。",
        ],
      },
    },
    {
      heading: { en: "Service providers (sub-processors)", zh: "服务提供方（子处理方）" },
      body: {
        en: [
          "We rely on a small set of providers to run the Service: application hosting (currently Render), database and storage (currently Turso), and transactional email delivery (currently Resend). If you use GitHub sign-in, GitHub processes your authentication; if you enable AI, the AI provider you choose processes the content of those requests.",
          "Each provider processes data only to perform its function and under its own security and privacy commitments. This list may change as the Service evolves; material changes are reflected by the effective date above.",
        ],
        zh: [
          "我们依赖一小组服务商运行本服务：应用托管（当前为 Render）、数据库与存储（当前为 Turso）、事务性邮件投递（当前为 Resend）。若你使用 GitHub 登录，GitHub 会处理你的身份验证；若你启用 AI，你所选择的 AI 服务商会处理相应请求的内容。",
          "各服务商仅为履行其功能、并在其自身的安全与隐私承诺下处理数据。该清单可能随服务演进而变化，重大变更以上方生效日期为准。",
        ],
      },
    },
    {
      heading: { en: "Data retention", zh: "数据留存" },
      body: {
        en: [
          "We keep your account and product data for as long as your account exists. Short-lived security tokens (such as email-verification, password-reset, and session tokens) expire automatically and are pruned. When you delete your account, your data is removed as described below.",
        ],
        zh: [
          "在你的账号存续期间，我们保留你的账号与产品数据。短时效的安全令牌（如邮箱验证、密码重置与会话令牌）会自动过期并被清理。当你删除账号时，你的数据将按下文所述被移除。",
        ],
      },
    },
    {
      heading: { en: "International transfers", zh: "跨境传输" },
      body: {
        en: [
          "Our providers may process data in countries other than yours. Where required, such transfers rely on appropriate safeguards (such as the providers’ standard contractual clauses).",
        ],
        zh: [
          "我们的服务商可能在你所在国家/地区以外处理数据。在必要时，此类传输依赖适当的保障措施（如服务商的标准合同条款）。",
        ],
      },
    },
    {
      heading: { en: "Your rights and controls", zh: "你的权利与控制" },
      body: {
        en: [
          "You can export all of your data at any time from Account → Data & privacy as a machine-readable JSON file.",
          "You can permanently delete your account and all associated data from Account → Danger zone. Deletion is immediate and irreversible.",
          "Depending on where you live, you may also have rights to access, correct, restrict, or object to processing, and to lodge a complaint with your data-protection authority. Most of these you can exercise directly in-app; for anything else, contact us.",
        ],
        zh: [
          "你可随时在“账号 → 数据与隐私”中，将全部数据导出为机器可读的 JSON 文件。",
          "你可在“账号 → 危险区”永久删除账号及全部关联数据。删除立即生效且不可撤销。",
          "视你所在地区而定，你可能还享有访问、更正、限制或反对处理的权利，以及向数据保护机构投诉的权利。其中多数可在应用内直接行使；如需其他协助，请联系我们。",
        ],
      },
    },
    {
      heading: { en: "Security", zh: "安全" },
      body: {
        en: [
          "We use industry-standard measures to protect your data, including hashed passwords, encryption of sensitive secrets at rest, encrypted transport (HTTPS), and strict per-account data isolation. No system is perfectly secure, but we work to protect your information and to respond promptly to issues.",
        ],
        zh: [
          "我们采用行业标准措施保护你的数据，包括密码哈希、对敏感机密的静态加密、传输加密（HTTPS）以及严格的按账号数据隔离。没有系统能做到绝对安全，但我们会努力保护你的信息并及时响应问题。",
        ],
      },
    },
    {
      heading: { en: "Children’s privacy", zh: "儿童隐私" },
      body: {
        en: [
          "Lumo is not intended for children under 13 (or the minimum age of digital consent where you live). We do not knowingly collect data from children. If you believe a child has provided us data, contact us and we will delete it.",
        ],
        zh: [
          "Lumo 不面向 13 周岁以下（或你所在地区规定的数字同意最低年龄以下）的儿童。我们不会在知情下收集儿童数据。若你认为有儿童向我们提供了数据，请联系我们，我们会予以删除。",
        ],
      },
    },
    {
      heading: { en: "Cookies and local storage", zh: "Cookie 与本地存储" },
      body: {
        en: [
          "Lumo uses your browser’s local storage to keep you signed in and to remember your preferences. We do not use advertising cookies or cross-site tracking. Clearing local storage signs you out on that device.",
        ],
        zh: [
          "Lumo 使用浏览器的本地存储来保持登录状态并记住你的偏好。我们不使用广告 Cookie 或跨站追踪。清除本地存储会使你在该设备上退出登录。",
        ],
      },
    },
    {
      heading: { en: "Changes to this policy", zh: "本政策的变更" },
      body: {
        en: [
          "We may update this policy as the product evolves. Material changes will be reflected by the effective date above.",
        ],
        zh: [
          "随着产品演进，我们可能更新本政策。重大变更将通过上方生效日期体现。",
        ],
      },
    },
    {
      heading: { en: "Contact", zh: "联系我们" },
      body: { en: [CONTACT.en], zh: [CONTACT.zh] },
    },
  ],
};

/** Lookup table so callers can pick a doc by key. */
export const LEGAL_DOCS: Record<LegalDocKey, LegalDoc> = {
  terms: TERMS_DOC,
  privacy: PRIVACY_DOC,
};

// Re-exported for callers that want to deep-link the project / donation page.
export { GITHUB_URL };
