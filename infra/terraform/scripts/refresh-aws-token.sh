#!/usr/bin/env bash

aws sts get-session-token | jq -r '
  .Credentials |
  "AWS_ACCESS_KEY_ID=\(.AccessKeyId)\nAWS_SECRET_ACCESS_KEY=\(.SecretAccessKey)\nAWS_SESSION_TOKEN=\(.SessionToken)\nAWS_SESSION_EXPIRATION=\(.Expiration)"
'