import React, { useState } from "react";
import { Mail, Lock, LogIn } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { PasswordToggle } from "@/components/auth/PasswordToggle";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { translator, type Lang } from "@/lib/i18n";

interface Props {
  serverError?: string | null;
  lang?: Lang;
}

export default function SignInForm({ serverError, lang = "en" }: Props) {
  const t = translator(lang);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  function validate() {
    const next: typeof errors = {};
    if (!email.trim()) {
      next.email = t("auth.err.emailRequired");
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      next.email = t("auth.err.emailInvalid");
    }
    if (!password) {
      next.password = t("auth.err.passwordRequired");
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function clearError(field: keyof typeof errors) {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (!validate()) {
      e.preventDefault();
    }
  }

  return (
    <form method="POST" action="/api/auth/signin" className="space-y-4" onSubmit={handleSubmit} noValidate>
      <FormField
        id="email"
        type="email"
        label={t("auth.email")}
        value={email}
        onChange={(v) => {
          setEmail(v);
          clearError("email");
        }}
        placeholder={t("auth.email.placeholder")}
        error={errors.email}
        icon={<Mail className="size-4" />}
      />

      <FormField
        id="password"
        label={t("auth.password")}
        type={showPassword ? "text" : "password"}
        value={password}
        onChange={(v) => {
          setPassword(v);
          clearError("password");
        }}
        placeholder={t("auth.password.placeholder")}
        error={errors.password}
        icon={<Lock className="size-4" />}
        endContent={
          <PasswordToggle
            visible={showPassword}
            showLabel={t("auth.show")}
            hideLabel={t("auth.hide")}
            onToggle={() => {
              setShowPassword(!showPassword);
            }}
          />
        }
      />

      <ServerError message={serverError} />

      <SubmitButton pendingText={t("auth.signin.pending")} icon={<LogIn className="size-4" />}>
        {t("auth.signin.title")}
      </SubmitButton>
    </form>
  );
}
