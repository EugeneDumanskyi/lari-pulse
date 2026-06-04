import { NextResponse } from "next/server";
import { ApiInputError } from "./apiValidation";

export function okJson<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(
    {
      status: "ok",
      data
    },
    init
  );
}

export function apiErrorJson(error: unknown, fallbackMessage = "Request failed") {
  if (error instanceof ApiInputError) {
    return NextResponse.json(
      {
        status: "error",
        message: error.message
      },
      { status: error.statusCode }
    );
  }

  if (error instanceof Error && "statusCode" in error && typeof error.statusCode === "number") {
    return NextResponse.json(
      {
        status: "error",
        message: error.message
      },
      { status: error.statusCode }
    );
  }

  return NextResponse.json(
    {
      status: "error",
      message: error instanceof Error ? error.message : fallbackMessage
    },
    { status: 500 }
  );
}
