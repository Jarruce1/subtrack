import React, { useState } from "react";
import { Mail, Lock, UserPlus } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { PasswordToggle } from "@/components/auth/PasswordToggle";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { translator, type Lang } from "@/lib/i18n";

const MIN_PASSWORD_LENGTH = 6;

interface Props {
  serverError?: string | null;
  lang?: Lang;
}

export default function SignUpForm({ serverError, lang = "en" }: Props) {
  const t = translator(lang);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; confirmPassword?: string }>({});

  function validate() {
    const next: typeof errors = {};

    if (!email.trim()) {
      next.email = t("auth.err.emailRequired");
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      next.email = t("auth.err.emailInvalid");
    }

    if (!password) {
      next.password = t("auth.err.passwordRequired");
    } else if (password.length < MIN_PASSWORD_LENGTH) {
      next.password = t("auth.err.passwordMin");
    }

    if (!confirmPassword) {
      next.confirmPassword = t("auth.err.confirmRequired");
    } else if (password !== confirmPassword) {
      next.confirmPassword = t("auth.err.confirmMismatch");
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

  const passwordHint =
    !errors.password && password.length > 0 && password.length < MIN_PASSWORD_LENGTH ? (
      <p className="text-muted-foreground mt-1 text-xs">
        {lang === "pl"
          ? `Brakuje jeszcze ${String(MIN_PASSWORD_LENGTH - password.length)} zn.`
          : `${String(MIN_PASSWORD_LENGTH - password.length)} more character${
              MIN_PASSWORD_LENGTH - password.length !== 1 ? "s" : ""
            } needed`}
      </p>
    ) : undefined;

  return (
    <form method="POST" action="/api/auth/signup" className="space-y-4" onSubmit={handleSubmit} noValidate>
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
        placeholder={t("auth.password.min.placeholder")}
        error={errors.password}
        hint={passwordHint}
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

      <FormField
        id="confirmPassword"
        name="confirmPassword"
        label={t("auth.confirm")}
        type={showConfirmPassword ? "text" : "password"}
        value={confirmPassword}
        onChange={(v) => {
          setConfirmPassword(v);
          clearError("confirmPassword");
        }}
        placeholder={t("auth.confirm.placeholder")}
        error={errors.confirmPassword}
        icon={<Lock className="size-4" />}
        endContent={
          <PasswordToggle
            visible={showConfirmPassword}
            showLabel={t("auth.show")}
            hideLabel={t("auth.hide")}
            onToggle={() => {
              setShowConfirmPassword(!showConfirmPassword);
            }}
          />
        }
      />

      <ServerError message={serverError} />

      <SubmitButton pendingText={t("auth.signup.pending")} icon={<UserPlus className="size-4" />}>
        {t("auth.signup.submit")}
      </SubmitButton>
    </form>
  );
}
