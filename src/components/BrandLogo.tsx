type BrandLogoProps = {
  size?: number;
  className?: string;
  showWordmark?: boolean;
  wordmarkSize?: "sm" | "md" | "lg";
};

export function BrandLogo({
  size = 40,
  className = "",
  showWordmark = false,
  wordmarkSize = "md",
}: BrandLogoProps) {
  const titleClass =
    wordmarkSize === "lg" ? "brand-wordmark lg" : wordmarkSize === "sm" ? "brand-wordmark sm" : "brand-wordmark";

  return (
    <div className={`brand-logo ${className}`.trim()}>
      <img
        src="/nexron-logo.png"
        alt="NEXRON Flow"
        width={size}
        height={size}
        className="brand-logo-mark"
        draggable={false}
      />
      {showWordmark ? (
        <div className={titleClass}>
          <strong>NEXRON</strong>
          <span>Flow</span>
        </div>
      ) : null}
    </div>
  );
}
