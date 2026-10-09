import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTypescript } from "./helpers/load-typescript.mjs";

const FeedbackAccessBanner = loadTypescript("src/features/feedback/FeedbackAccessBanner.tsx").default;
const compUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const date = compUntil.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
const render = (user) => renderToStaticMarkup(React.createElement(FeedbackAccessBanner, { user }));

test("actual rendered pass banner appears for feedback, paying and lifetime redeemers without changing their source", () => {
  for (const account of [
    { accessSource: "feedback", subscriptionStatus: "new" },
    { accessSource: "stripe", subscriptionStatus: "active" },
    { accessSource: null, hasLifetimeAccess: true },
  ]) {
    const user = Object.freeze({ compUntil, feedbackPassCode: "FEEDBACK", ...account });
    const markup = render(user);
    assert.ok(markup.includes(`You have free access until ${date}. Thanks for helping.`));
    assert.ok(markup.includes('role="status"'));
    assert.equal(user.accessSource, account.accessSource);
  }
});

test("actual pass banner stays absent after expiry or without a valid persisted grant", () => {
  for (const user of [
    null,
    { compUntil: null, feedbackPassCode: "FEEDBACK", accessSource: "feedback" },
    { compUntil: new Date(0), feedbackPassCode: "FEEDBACK", accessSource: "feedback" },
    { compUntil, feedbackPassCode: null, accessSource: "feedback" },
    { compUntil, feedbackPassCode: "../invalid", accessSource: "feedback" },
  ]) assert.equal(render(user), "");
});
