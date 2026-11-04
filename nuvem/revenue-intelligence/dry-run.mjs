/* RI-00 — safe eligibility preview. Pure composition: no send, no DB,
 * no credentials, no timers, no changes to client CAS or decision engine.
 * NOT a permission token. Future server-side ActionGateway must re-read and
 * revalidate all authorization/recipient records immediately before sending.
 */
import {buildIntent} from './intent.mjs';
import {authorizeDispatch} from './dispatch-policy.mjs';

export async function previewDispatch(input) {
  if(!input||typeof input!=='object'||!input.context||!input.proposal)
    return {status:'blocked',reason:'invalid_input'};
  let intent;
  try {intent=await buildIntent(input.proposal);} catch (_error) {
    return {status:'blocked',reason:'invalid_input'};
  }
  const action={
    ...intent,
    actorId:input.context.actorId,
    destination:input.proposal.contactAddress,
    alreadyDispatched:input.proposal.alreadyDispatched,
    dailyCount:input.proposal.dailyCount
  };
  const result=authorizeDispatch({
    context:input.context,
    campaign:input.campaign,
    approval:input.approval,
    recipient:input.recipient,
    provider:input.provider,
    action
  });
  return result.allowed
    ? {status:'eligible',reason:'allowed',intent}
    : {status:'blocked',reason:result.code};
}
