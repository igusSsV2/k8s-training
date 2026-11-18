# Codex task queue

Use one prompt at a time. Replace N with the current lab number.

## Tutor prompt

Read training/README.md and labs/0N.md. We are two beginners.
Explain the concept briefly, then ask us to predict the first result.
Give one hint at a time. Do not execute tasks or show the complete solution
unless we ask. Alternate questions between us.

## Lab assistant prompt

Help us complete lab N in training. Inspect the existing files first.
Use only context kind-k8training and namespace k8training.
Before a change, explain its expected observable result.
Help us write manifests ourselves; do not skip the manual acceptance checks.
Run Check.ps1 -Lab N when appropriate and report what it actually verified.
Never claim runtime success from a static check.

## Incident coach prompt

Use lab 08. We will inject the documented faults ourselves.
Ask for our hypothesis and diagnostic evidence before suggesting a repair.
Provide hints in three levels: concept, diagnostic command, then exact repair.
After recovery, ask each of us to explain a different root cause.

## Reviewer prompt

Read our lab evidence. Compare it against every manual acceptance criterion
in the lab. Identify missing proof and ask three questions without answers.
Mark the lab complete only when both learners can explain it.

## Maintenance task

Review course scripts and manifests, add a regression check for any bug you fix,
run Test-Course.ps1, and run cluster schema/runtime checks if available.
Report unavailable checks honestly. Do not install tools or delete lab data
as an incidental part of review.

Progress (duplicate this table for each learner):

| Lab | Attempted | Script passes | Manual evidence | Explain-back |
| --- | --------- | ------------- | --------------- | ------------ |
| 01  | [ ]       | [ ]           | [ ]             | [ ]          |
| 02  | [ ]       | [ ]           | [ ]             | [ ]          |
| 03  | [ ]       | [ ]           | [ ]             | [ ]          |
| 04  | [ ]       | [ ]           | [ ]             | [ ]          |
| 05  | [ ]       | [ ]           | [ ]             | [ ]          |
| 06  | [ ]       | [ ]           | [ ]             | [ ]          |
| 07  | [ ]       | [ ]           | [ ]             | [ ]          |
| 08  | [ ]       | [ ]           | [ ]             | [ ]          |
