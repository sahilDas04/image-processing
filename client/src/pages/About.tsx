import {
  IconSparkles,
  IconShieldCheck,
  IconBolt,
  IconPhoto,
  IconFileText,
  IconWand,
  IconLock,
  IconHistory,
} from "@tabler/icons-react";

import { Navbar } from "@/components";

const FEATURES = [
  {
    icon: IconWand,
    title: "Powerful filters",
    description: "Grayscale, blur, sharpen, enhance, rotate, resize, compress and more — applied in one click.",
  },
  {
    icon: IconFileText,
    title: "PDF toolkit",
    description: "Convert images into a multi-page PDF, or render PDF pages back to high-quality images.",
  },
  {
    icon: IconBolt,
    title: "Fast, in the cloud",
    description: "Files are processed server-side, so your device stays responsive even for large images.",
  },
  {
    icon: IconHistory,
    title: "Processing history",
    description: "Every conversion you run is saved, so you can download the result again at any time.",
  },
  {
    icon: IconShieldCheck,
    title: "Private by default",
    description: "You sign in with Google and your images are only ever accessible to you.",
  },
  {
    icon: IconLock,
    title: "Secure storage",
    description: "Uploads and results are stored safely and never shared with other users.",
  },
];

export default function AboutPage() {
  return (
    <main className="page-bg relative min-h-svh text-foreground">
      <Navbar />

      <section className="relative z-10 mx-auto w-full max-w-5xl px-4 pb-24 pt-10">
        <div className="mb-12 text-center">
          <div className="mx-auto mb-6 grid size-16 place-items-center rounded-3xl bg-gradient-to-br from-primary to-primary/80 text-white shadow-[0_12px_40px_rgba(90,70,160,0.35)]">
            <IconSparkles className="size-8" aria-hidden="true" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">About Image Lab</h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Image Lab is a browser-based image processing toolbox. Upload a photo or PDF, pick an
            operation, and get a polished result back in seconds — no desktop software needed.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="group rounded-3xl glass-strong border border-white/40 p-6 shadow-[0_8px_32px_rgba(90,70,160,0.08)] transition-all hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(90,70,160,0.15)]"
            >
              <div className="mb-4 grid size-11 place-items-center rounded-2xl bg-primary/15 text-primary transition-all group-hover:scale-110" aria-hidden="true">
                <feature.icon className="size-6" />
              </div>
              <h2 className="text-base font-semibold">{feature.title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
            </div>
          ))}
        </div>

        <div className="mx-auto mt-14 max-w-3xl rounded-3xl glass-strong border border-white/40 p-8 text-center">
          <IconPhoto className="mx-auto size-8 text-primary" aria-hidden="true" />
          <h2 className="mt-4 text-xl font-semibold">How it works</h2>
          <ol className="mx-auto mt-4 max-w-xl space-y-3 text-left text-sm text-muted-foreground">
            <li className="flex gap-3">
              <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary" aria-hidden="true">1</span>
              <span>Sign in with your Google account from the login page.</span>
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary" aria-hidden="true">2</span>
              <span>Drop an image or PDF on the home page and pick an operation.</span>
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary" aria-hidden="true">3</span>
              <span>Download the result, or revisit it later from your processing history.</span>
            </li>
          </ol>
        </div>
      </section>
    </main>
  );
}