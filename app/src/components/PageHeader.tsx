import Image from "next/image";

interface PageHeaderProps {
  imageSrc: string;
  title: string;
  subtitle?: string;
}

export default function PageHeader({ imageSrc, title, subtitle }: PageHeaderProps) {
  return (
    <div className="relative h-[200px] overflow-hidden max-md:h-[160px]">
      <Image
        src={imageSrc}
        alt=""
        fill
        className="object-cover"
        priority
      />
      <div className="absolute inset-0 bg-gradient-to-t from-paper/90 via-paper/40 to-paper/20" />
      <div className="relative z-10 flex h-full flex-col justify-end px-12 pb-6 max-md:px-6">
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(1.8rem, 3.5vw, 2.5rem)",
            fontWeight: 400,
            color: "var(--ink)",
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-[0.9rem] text-ink-light">{subtitle}</p>
        )}
      </div>
    </div>
  );
}
