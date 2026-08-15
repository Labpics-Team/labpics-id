"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AuthShell, CardHairline } from "@/components/auth/auth-shell";
import { ChevronLeftIcon, KeyIcon } from "@/components/auth/brand";
import { CountdownResend } from "@/components/auth/countdown-resend";
import { OtpField } from "@/components/auth/otp-field";
import { Spinner } from "@/components/auth/spinner";
import { TextField } from "@/components/auth/text-field";
import { Button } from "@/components/primitives/button";
import { requestOtpCode, verifyOtpCode } from "./actions";

type Step = { name: "identify" } | { name: "otp"; email: string };

/*
 * A1 sign-in + A4 OTP as one client flow (Figma frames 1552:3908 → 1563:7321).
 * Step state is local: the OTP step exists only after a code was requested,
 * so a hard refresh legitimately restarts identification.
 */
export function LoginFlow() {
  const [step, setStep] = useState<Step>({ name: "identify" });

  if (step.name === "otp") {
    return <OtpStep email={step.email} onBack={() => setStep({ name: "identify" })} />;
  }
  return <IdentifyStep onCodeSent={(email) => setStep({ name: "otp", email })} />;
}

/* ---------------------------------------------------------------- A1 ---- */

function IdentifyStep({ onCodeSent }: { onCodeSent: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const canSubmit = email.trim().length > 0 && !pending;

  function submit() {
    if (!canSubmit) return;
    setError(undefined);
    startTransition(async () => {
      const result = await requestOtpCode(email);
      if (result.ok) {
        onCodeSent(result.maskedEmail);
      } else {
        setError(
          result.error === "account-not-found"
            ? "Аккаунт не найден"
            : "Введите корректный адрес почты",
        );
      }
    });
  }

  return (
    <AuthShell>
      <div className="flex flex-col gap-lab-36">
        {/* Header (gap 12, centered) + full-bleed hairline under it. */}
        <header className="flex flex-col gap-lab-12 text-center">
          <h1 className="text-title text-label-p">Войти через Labpics ID</h1>
          <p className="text-input text-label-s">Единый вход в сервисы Labpics</p>
        </header>
        <CardHairline />

        {/* Social block: 2-up provider row + full-width passkeys. */}
        <div className="flex flex-col gap-lab-16">
          <div className="grid grid-cols-2 gap-lab-16">
            {/* Provider logos are the single brand-color exemption: static
                SVG assets, never inline hex in component code. `unoptimized`
                because the image optimizer rejects SVG without
                dangerouslyAllowSVG and a 20px logo gains nothing from it. */}
            <Button variant="secondary" className="h-control" disabled={pending}>
              <Image
                src="/brand/yandex.svg"
                alt=""
                width={20}
                height={20}
                unoptimized
                aria-hidden
              />
              Яндекс
            </Button>
            <Button variant="secondary" className="h-control" disabled={pending}>
              <Image
                src="/brand/telegram.svg"
                alt=""
                width={20}
                height={20}
                unoptimized
                aria-hidden
              />
              Telegram
            </Button>
          </div>
          <Button variant="secondary" className="h-control w-full" disabled={pending}>
            <KeyIcon />
            Войти с Passkeys
          </Button>
        </div>

        {/* Divider: hairline — «или» — hairline. */}
        <div className="flex items-center gap-lab-12" aria-hidden="true">
          <span className="h-px flex-1 bg-hairline" />
          <span className="text-caption text-label-t">или</span>
          <span className="h-px flex-1 bg-hairline" />
        </div>

        {/* Email + primary CTA. */}
        <form
          className="flex flex-col gap-lab-24"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <TextField
            label="Электронная почта"
            type="email"
            name="email"
            autoComplete="email"
            value={email}
            error={error}
            disabled={pending}
            onChange={(event) => {
              setEmail(event.target.value);
              if (error !== undefined) setError(undefined);
            }}
          />
          <Button
            type="submit"
            className="h-control w-full"
            disabled={!canSubmit}
            aria-busy={pending || undefined}
          >
            {pending ? (
              <>
                <Spinner />
                <span className="sr-only">Отправляем код…</span>
              </>
            ) : (
              "Получить код"
            )}
          </Button>
        </form>
      </div>
    </AuthShell>
  );
}

/* ---------------------------------------------------------------- A4 ---- */

function OtpStep({ email, onBack }: { email: string; onBack: () => void }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function verify(submitted: string) {
    if (pending) return;
    setError(undefined);
    startTransition(async () => {
      const result = await verifyOtpCode(email, submitted);
      if (result.ok) {
        router.push(result.redirectTo);
      } else {
        setError(result.error === "expired-code" ? "Код истёк" : "Неверный код");
        setCode("");
      }
    });
  }

  return (
    <AuthShell showLogoTile={false}>
      <div className="flex flex-col gap-lab-48">
        <header className="flex flex-col gap-lab-12 text-center">
          <h1 className="text-title text-label-p">Введите код</h1>
          <p className="text-input text-label-s">
            Код отправлен на <span className="text-label-p">{email}</span>
          </p>
        </header>

        <div className="flex flex-col gap-lab-16" aria-busy={pending || undefined}>
          <OtpField
            value={code}
            onChange={(next) => {
              setCode(next);
              if (error !== undefined) setError(undefined);
            }}
            onComplete={verify}
            disabled={pending}
            error={error}
          />
          {pending ? (
            <p
              className="flex items-center justify-center gap-lab-8 text-caption text-label-t"
              aria-live="polite"
            >
              <Spinner />
              Проверяем код…
            </p>
          ) : (
            <CountdownResend
              onResend={() => {
                setCode("");
                setError(undefined);
                void requestOtpCode(email);
              }}
            />
          )}
        </div>

        <Button
          variant="secondary"
          className="h-control w-full"
          onClick={onBack}
          disabled={pending}
        >
          <ChevronLeftIcon />
          Вернуться назад
        </Button>
      </div>
    </AuthShell>
  );
}
