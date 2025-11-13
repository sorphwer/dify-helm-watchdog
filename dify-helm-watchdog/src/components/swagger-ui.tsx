"use client";

import "swagger-ui-react/swagger-ui.css";
import dynamic from "next/dynamic";
import { useCallback } from "react";
import type SwaggerUIReact from "swagger-ui-react";

type SwaggerUIProps = React.ComponentProps<typeof SwaggerUIReact>;

const SwaggerUI = dynamic<SwaggerUIProps>(
  () => import("swagger-ui-react").then((mod) => mod.default),
  { ssr: false },
);

interface SwaggerUIWrapperProps {
  spec: SwaggerUIProps["spec"];
}

export function SwaggerUIWrapper({ spec }: SwaggerUIWrapperProps) {
  const handleComplete = useCallback((system: unknown) => {
    if (
      !system ||
      typeof system !== "object" ||
      !("getComponent" in system) ||
      typeof system.getComponent !== "function"
    ) {
      return;
    }

    type StrictModePatchableComponent = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      new (...args: any[]): any;
      prototype?: {
        UNSAFE_componentWillReceiveProps?: (props: unknown) => void;
      };
      getDerivedStateFromProps?: (
        nextProps: unknown,
        prevState?: Record<string, unknown>,
      ) => Record<string, unknown> | null;
      __strictModePatched?: boolean;
    };

    const systemWithGetComponent = system as {
      getComponent: (name: string, flag: boolean) => unknown;
    };

    const patchUnsafeLifecycle = (componentName: string) => {
      const maybeComponent = systemWithGetComponent.getComponent(
        componentName,
        true,
      ) as unknown;

      if (typeof maybeComponent !== "function") {
        return;
      }

      const component = maybeComponent as StrictModePatchableComponent;

      if (component.__strictModePatched) {
        return;
      }

      const prototype = component.prototype;

      if (!prototype) {
        component.__strictModePatched = true;
        return;
      }

      const originalLifecycle = prototype
        .UNSAFE_componentWillReceiveProps as
        | ((props: unknown) => void)
        | undefined;

      if (typeof originalLifecycle !== "function") {
        component.__strictModePatched = true;
        return;
      }

      component.getDerivedStateFromProps ??= (
        nextProps: unknown,
        prevState?: Record<string, unknown>,
      ) => {
        let draftState: Record<string, unknown> = { ...(prevState ?? {}) };
        let hasUpdate = false;

        const instance: {
          state: Record<string, unknown>;
          setState: (update: unknown) => void;
        } = {
          state: draftState,
          setState(update: unknown) {
            const partial =
              typeof update === "function"
                ? (update as (current: Record<string, unknown>) => unknown)(
                    instance.state,
                  )
                : update;

            if (partial && typeof partial === "object") {
              draftState = { ...draftState, ...(partial as object) };
              instance.state = draftState;
              hasUpdate = true;
            }
          },
        };

        originalLifecycle.call(instance, nextProps);
        return hasUpdate ? draftState : null;
      };

      delete prototype.UNSAFE_componentWillReceiveProps;
      component.__strictModePatched = true;
    };

    patchUnsafeLifecycle("JsonSchema_array");
    patchUnsafeLifecycle("ParameterRow");
  }, []);

  return (
    <div className="h-full overflow-auto">
      <style>
        {`
          .swagger-ui .info {
            display: none;
          }
        `}
      </style>
      <SwaggerUI
        spec={spec}
        docExpansion="list"
        defaultModelsExpandDepth={-1}
        onComplete={handleComplete}
      />
    </div>
  );
}

