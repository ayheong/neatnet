import type { ReactNode, MouseEvent } from "react";
import { open_external_url } from "../lib/openExternalUrl";

type ExternalLinkProps = {
  href: string;
  className?: string;
  children: ReactNode;
};

export function ExternalLink({ href, className, children }: ExternalLinkProps) {
  function handle_click(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    void open_external_url(href);
  }

  return (
    <a href={href} className={className} onClick={handle_click}>
      {children}
    </a>
  );
}
