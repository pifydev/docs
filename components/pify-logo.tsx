import Image from "next/image";

export function PifyLogo() {
  return (
    <span className="pify-brand" aria-label="Pify">
      <span className="pify-brand-mark" aria-hidden="true">
        <Image
          className="pify-logo-light"
          src="/pify-on-light-128.png"
          alt=""
          width={28}
          height={28}
          priority
        />
        <Image
          className="pify-logo-dark"
          src="/pify-on-dark-128.png"
          alt=""
          width={28}
          height={28}
          priority
        />
      </span>
      <span>Pify</span>
    </span>
  );
}
