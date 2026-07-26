import assert from 'node:assert/strict';
import { createGpuWorkCoordinator } from './gpuWorkCoordinator.ts';

async function settles(promise) {
  let settled = false;
  void promise.then(() => {
    settled = true;
  });
  await Promise.resolve();
  return settled;
}

{
  const coordinator = createGpuWorkCoordinator();
  const firstNormal = coordinator.beginNormal();
  const secondNormal = coordinator.beginNormal();
  const frontier = coordinator.beginFrontier();

  assert.equal(firstNormal.isCurrent(), false);
  assert.equal(firstNormal.signal.aborted, true);
  assert.equal(secondNormal.isCurrent(), false);
  assert.equal(secondNormal.signal.aborted, true);
  assert.equal(frontier.isCurrent(), true);
  assert.equal(await settles(frontier.waitForPriorOwners), false);

  secondNormal.settle();
  assert.equal(await settles(frontier.waitForPriorOwners), false);

  firstNormal.settle();
  await frontier.waitForPriorOwners;
  assert.equal(await settles(frontier.waitForPriorOwners), true);
  frontier.settle();
}

{
  const coordinator = createGpuWorkCoordinator();
  const frontier = coordinator.beginFrontier();
  const normal = coordinator.beginNormal();

  assert.equal(frontier.isCurrent(), false);
  assert.equal(frontier.signal.aborted, true);
  assert.equal(normal.isCurrent(), true);
  assert.equal(await settles(normal.waitForPriorOwners), false);

  frontier.settle();
  await normal.waitForPriorOwners;
  assert.equal(await settles(normal.waitForPriorOwners), true);
  normal.settle();
}

{
  const coordinator = createGpuWorkCoordinator();
  const firstFrontier = coordinator.beginFrontier();
  const secondFrontier = coordinator.beginFrontier();
  const thirdFrontier = coordinator.beginFrontier();

  assert.equal(firstFrontier.isCurrent(), false);
  assert.equal(firstFrontier.signal.aborted, true);
  assert.equal(secondFrontier.isCurrent(), false);
  assert.equal(secondFrontier.signal.aborted, true);
  assert.equal(thirdFrontier.isCurrent(), true);
  firstFrontier.settle();
  assert.equal(thirdFrontier.isCurrent(), true);
  secondFrontier.settle();
  await thirdFrontier.waitForPriorOwners;
  thirdFrontier.settle();
}

{
  const coordinator = createGpuWorkCoordinator();
  const full = coordinator.beginNormal();
  const preview = coordinator.beginNormal();
  const safeWithdrawal = coordinator.beginNormal();
  const frontier = coordinator.beginFrontier();

  safeWithdrawal.settle();
  preview.settle();
  assert.equal(await settles(frontier.waitForPriorOwners), false);
  full.settle();
  await frontier.waitForPriorOwners;
  frontier.settle();
}

{
  const coordinator = createGpuWorkCoordinator();
  const firstNormal = coordinator.beginNormal();
  const secondNormal = coordinator.beginNormal();

  firstNormal.settle();
  assert.equal(secondNormal.isCurrent(), true);
  secondNormal.settle();
}

{
  const coordinator = createGpuWorkCoordinator();
  const normal = coordinator.beginNormal();
  normal.settle();
  const frontier = coordinator.beginFrontier();

  assert.equal(frontier.supersededNormal, false);
  assert.equal(frontier.isCurrent(), true);
  coordinator.dispose();
  assert.equal(frontier.isCurrent(), false);
  assert.equal(frontier.signal.aborted, true);
  assert.equal(normal.isCurrent(), false);
  frontier.settle();
}

{
  const coordinator = createGpuWorkCoordinator();
  const firstFrontier = coordinator.beginFrontier();
  const normal = coordinator.beginNormal();
  const secondFrontier = coordinator.beginFrontier();

  assert.equal(firstFrontier.signal.aborted, true);
  assert.equal(normal.signal.aborted, true);
  assert.equal(secondFrontier.isCurrent(), true);
  assert.equal(await settles(secondFrontier.waitForPriorOwners), false);

  firstFrontier.settle();
  await normal.waitForPriorOwners;
  assert.equal(await settles(secondFrontier.waitForPriorOwners), false);
  normal.settle();
  await secondFrontier.waitForPriorOwners;
  secondFrontier.settle();
}

{
  const coordinator = createGpuWorkCoordinator();
  const firstNormal = coordinator.beginNormal();
  const secondNormal = coordinator.beginNormal();
  secondNormal.settle();
  const frontier = coordinator.beginFrontier();

  assert.equal(frontier.supersededNormal, true);
  assert.equal(await settles(frontier.waitForPriorOwners), false);
  firstNormal.settle();
  await frontier.waitForPriorOwners;
  frontier.settle();
}

console.log('gpu work coordinator: passed');
