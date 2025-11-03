#!/bin/bash

export AWS_REGION=us-east-1
export TF_STATE_BUCKET=git-odyssey-tf-state
export TF_LOCK_TABLE=git-odyssey-tf-locks

aws s3api create-bucket --bucket "$TF_STATE_BUCKET" --region $AWS_REGION
aws dynamodb create-table \
    --table-name "$TF_LOCK_TABLE" \
    --attribute-definitions AttributeName=LockID,AttributeType=S \
    --key-schema AttributeName=LockID,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST
