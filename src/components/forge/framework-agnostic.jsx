"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

const FrameworkAgnostic = ({
  cardTitle = "Framework Agnostic",
  cardDescription = "Seamlessly integrate with any tech stack, whether it's Next.js, React, HTML, or anything else. Statsio works everywhere.",
}) => {
  return (
    <div
      className={cn(
        "relative",
        "flex flex-col justify-between",
        "h-[20rem] space-y-4",
        "rounded-md border border-neutral-800/50 bg-neutral-950"
      )}
    >
      <FrameworkCard />
      <div className="px-4 pb-4">
        <div className="text-sm font-semibold text-white">{cardTitle}</div>
        <div className="mt-2 text-xs text-neutral-400">{cardDescription}</div>
      </div>
    </div>
  );
};

export default FrameworkAgnostic;

const FrameworkCard = () => {
  const [nextJsTransform, setNextJsTransform] = useState("none");
  const [reactTransform, setReactTransform] = useState("none");
  const [htmlTransform, setHtmlTransform] = useState("none");

  useEffect(() => {
    const cycleAnimations = async () => {
      const upStyle = "translateY(-3.71px) rotateX(10.71deg) translateZ(20px)";
      const downStyle = "none";

      const transitionDuration = 1100;
      const durationOfUpState = 1200;
      const delayBetweenCards = 600;

      while (true) {
        setReactTransform(upStyle);
        await new Promise((resolve) => setTimeout(resolve, durationOfUpState));
        setReactTransform(downStyle);
        await new Promise((resolve) =>
          setTimeout(resolve, transitionDuration + delayBetweenCards)
        );

        setNextJsTransform(upStyle);
        await new Promise((resolve) => setTimeout(resolve, durationOfUpState));
        setNextJsTransform(downStyle);
        await new Promise((resolve) =>
          setTimeout(resolve, transitionDuration + delayBetweenCards)
        );

        setHtmlTransform(upStyle);
        await new Promise((resolve) => setTimeout(resolve, durationOfUpState));
        setHtmlTransform(downStyle);
        await new Promise((resolve) =>
          setTimeout(resolve, transitionDuration + delayBetweenCards)
        );
      }
    };

    cycleAnimations();
  }, []);

  const cardClasses =
    "flex aspect-square items-center justify-center rounded-md border border-neutral-800 bg-gradient-to-b from-neutral-700 to-neutral-900 p-4 " +
    "[@media(min-width:320px)]:h-20 [@media(min-width:500px)]:h-36 " +
    "transition-transform duration-1000 ease-out will-change-transform";

  return (
    <div
      className={cn(
        "relative",
        "flex flex-col items-center justify-center gap-1",
        "h-[14.5rem] w-full"
      )}
    >
      <div className="absolute flex h-full w-full items-center justify-center">
        <div className="h-full w-[15rem]">
          <svg
            className="h-full w-full"
            width="100%"
            height="100%"
            viewBox="0 0 100 100"
            fill="none"
          >
            <g stroke="#737373" strokeWidth="0.1">
              <path d="M 1 0 v 5 q 0 5 5 5 h 39 q 5 0 5 5 v 71 q 0 5 5 5 h 39 q 5 0 5 5 v 5" />
            </g>
            <g mask="url(#framework-mask)">
              <circle
                className="frameworkline framework-line"
                cx="0"
                cy="0"
                r="12"
                fill="url(#framework-blue-grad)"
              />
            </g>
            <defs>
              <mask id="framework-mask">
                <path
                  d="M 1 0 v 5 q 0 5 5 5 h 39 q 5 0 5 5 v 71 q 0 5 5 5 h 39 q 5 0 5 5 v 5"
                  strokeWidth="0.3"
                  stroke="white"
                />
              </mask>
              <radialGradient id="framework-blue-grad" fx="1">
                <stop offset="0%" stopColor={"#3b82f6"} />
                <stop offset="100%" stopColor="transparent" />
              </radialGradient>
            </defs>
          </svg>
        </div>
      </div>

      <div
        className={cn(
          "flex items-center justify-center gap-4",
          "[perspective:1000px] [transform-style:preserve-3d]"
        )}
      >
        <div className={cardClasses} style={{ transform: reactTransform }}>
          <ReactIcon className="size-6 text-neutral-100 [@media(min-width:500px)]:size-9" />
        </div>
        <div className={cardClasses} style={{ transform: nextJsTransform }}>
          <NextjsIcon className="size-6 text-neutral-100 [@media(min-width:500px)]:size-9" />
        </div>
        <div className={cardClasses} style={{ transform: htmlTransform }}>
          <HTML5Icon className="size-6 text-neutral-100 [@media(min-width:500px)]:size-9" />
        </div>
      </div>

      <div className="absolute bottom-0 left-0 h-3 w-full bg-gradient-to-t from-neutral-950 to-transparent" />
    </div>
  );
};

const NextjsIcon = (props) => (
  <svg
    width="1em"
    height="1em"
    viewBox="0 0 180 180"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <mask
      id="mask0_408_139"
      style={{ maskType: "alpha" }}
      maskUnits="userSpaceOnUse"
      x={0}
      y={0}
      width={180}
      height={180}
    >
      <circle cx={90} cy={90} r={90} fill="black" />
    </mask>
    <g mask="url(#mask0_408_139)">
      <circle cx={90} cy={90} r={87} fill="black" stroke="white" strokeWidth={6} />
      <path
        d="M149.508 157.52L69.142 54H54V125.97H66.1136V69.3836L139.999 164.845C143.333 162.614 146.509 160.165 149.508 157.52Z"
        fill="url(#paint0_linear_408_139)"
      />
      <rect x={115} y={54} width={12} height={72} fill="url(#paint1_linear_408_139)" />
    </g>
    <defs>
      <linearGradient
        id="paint0_linear_408_139"
        x1={109}
        y1={116.5}
        x2={144.5}
        y2={160.5}
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="white" />
        <stop offset={1} stopColor="white" stopOpacity={0} />
      </linearGradient>
      <linearGradient
        id="paint1_linear_408_139"
        x1={121}
        y1={54}
        x2={120.799}
        y2={106.875}
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="white" />
        <stop offset={1} stopColor="white" stopOpacity={0} />
      </linearGradient>
    </defs>
  </svg>
);

const ReactIcon = (props) => (
  <svg
    viewBox="0 0 256 228"
    width="1em"
    height="1em"
    xmlns="http://www.w3.org/2000/svg"
    preserveAspectRatio="xMidYMid"
    {...props}
  >
    <path
      d="M210.483 73.824a171.49 171.49 0 0 0-8.24-2.597c..."
      fill="#00D8FF"
    />
  </svg>
);

const HTML5Icon = (props) => (
  <svg
    viewBox="0 0 452 520"
    width="1em"
    height="1em"
    xmlns="http://www.w3.org/2000/svg"
    preserveAspectRatio="xMidYMid"
    {...props}
  >
    <path fill="#e34f26" d="M41 460L0 0h451l-41 460-185 52" />
    <path fill="#ef652a" d="M226 472l149-41 35-394H226" />
    <path
      fill="#ecedee"
      d="M226 208h-75l-5-58h80V94H84l15 171h127zm0 147l-64-17-4-45h-56l7 89 117 32z"
    />
    <path
      fill="#fff"
      d="M226 265h69l-7 73-62 17v59l115-32 16-174H226zm0-171v56h136l5-56z"
    />
  </svg>
);
