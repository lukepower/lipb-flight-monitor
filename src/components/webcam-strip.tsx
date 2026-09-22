"use client";

import { Camera, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Panel, SectionKicker } from "@/components/panel";
import {
  withCacheBust,
  type WebcamBundle,
  type WebcamReading,
} from "@/lib/webcams";

export function WebcamStrip({ webcams }: { webcams: WebcamBundle }) {
  const valley = webcams.cams.filter((c) => c.group === "valley");
  const alpine = webcams.cams.filter((c) => c.group === "alpine");
  const any = webcams.cams.some((c) => c.stillUrl || c.linkUrl);

  if (!any) {
    return (
      <Panel className="border-amber-300/25 bg-amber-400/10">
        <SectionKicker>
          <TriangleAlert className="size-3.5" /> Webcams
        </SectionKicker>
        <p className="mt-3 text-sm text-[#f3efe4]">
          Webcams unavailable
          {webcams.error ? `: ${webcams.error}` : ""}
        </p>
      </Panel>
    );
  }

  return (
    <Panel>
      <div className="flex flex-wrap items-center gap-2">
        <SectionKicker>
          <Camera className="size-3.5" /> Webcams
        </SectionKicker>
        <Badge className="bg-white/12 text-[#f3efe4]">Valley + alpine</Badge>
        <span className="font-mono text-xs text-[#d7d2c4]/65">
          Stills · click for live view
        </span>
      </div>
      <CamGroup title="Valley" cams={valley} fetchedAt={webcams.fetchedAt} />
      <CamGroup title="Alpine" cams={alpine} fetchedAt={webcams.fetchedAt} />
    </Panel>
  );
}

function CamGroup({
  title,
  cams,
  fetchedAt,
}: {
  title: string;
  cams: WebcamReading[];
  fetchedAt: string;
}) {
  if (cams.length === 0) return null;
  return (
    <div className="mt-4">
      <p className="mb-2 text-[11px] font-semibold tracking-[0.16em] text-[#d7d2c4]/55 uppercase">
        {title}
      </p>
      <ul className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
        {cams.map((cam) => (
          <li key={cam.id}>
            <CamCard cam={cam} fetchedAt={fetchedAt} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function CamCard({ cam, fetchedAt }: { cam: WebcamReading; fetchedAt: string }) {
  const [broken, setBroken] = useState(false);
  const href = cam.linkUrl ?? cam.stillUrl;
  const still =
    cam.stillUrl && !broken ? withCacheBust(cam.stillUrl, fetchedAt) : null;

  const body = (
    <>
      <div className="relative aspect-video overflow-hidden bg-black/40">
        {still ? (
          // eslint-disable-next-line @next/next/no-img-element -- mixed third-party webcam hosts
          <img
            alt=""
            className="size-full object-cover"
            loading="lazy"
            onError={() => setBroken(true)}
            src={still}
          />
        ) : (
          <div className="flex size-full items-center justify-center text-xs text-[#d7d2c4]/45">
            No preview
          </div>
        )}
      </div>
      <div className="px-2.5 py-2">
        <p className="truncate text-sm font-medium text-[#f6f1e6]">{cam.name}</p>
        <p className="font-mono text-[11px] text-[#d7d2c4]/55">
          {cam.elevM !== null ? `${cam.elevM} m` : "—"}
          {cam.error ? ` · ${cam.error}` : ""}
        </p>
      </div>
    </>
  );

  if (!href) {
    return (
      <div className="overflow-hidden rounded-2xl border border-white/6 bg-black/20">
        {body}
      </div>
    );
  }

  return (
    <a
      className="block overflow-hidden rounded-2xl border border-white/6 bg-black/20 transition hover:border-emerald-300/35"
      href={href}
      rel="noreferrer"
      target="_blank"
    >
      {body}
    </a>
  );
}
