/**
 * Turn AWS S3 / SDK failures into short messages suitable for the UI.
 * HeadBucket often surfaces as name/message "UnknownError" with only HTTP status.
 */
export function friendlyS3Error(err: unknown): string {
  const e = err as {
    name?: string;
    message?: string;
    Code?: string;
    code?: string;
    $metadata?: { httpStatusCode?: number };
  };

  const status = e.$metadata?.httpStatusCode;
  const code = (e.Code || e.code || e.name || '').toString();
  const message = (e.message || '').toString();
  const blob = `${code} ${message}`.toLowerCase();

  if (
    status === 404 ||
    /nosuchbucket|notfound|nofound|http\/1\.1 404|statuscode.?404/.test(blob)
  ) {
    return 'Bucket not found. Check the bucket name and region (or endpoint).';
  }

  if (
    status === 403 ||
    /accessdenied|invalidaccesskeyid|signaturedoesnotmatch|invalidtoken|expiredtoken|forbidden|http\/1\.1 403|statuscode.?403/.test(
      blob,
    )
  ) {
    return 'Access denied. Check the access key, secret key, and bucket permissions.';
  }

  if (status === 301 || status === 307 || /permanentredirect|temporaryredirect/.test(blob)) {
    return 'Bucket exists in a different region. Update the region to match the bucket.';
  }

  if (/enotfound|econnrefused|etimedout|networkingerror|getaddrinfo|connect/.test(blob)) {
    return 'Could not reach the storage endpoint. Check the endpoint URL and network.';
  }

  if (message && !/^unknownerror$/i.test(message)) {
    return message;
  }

  if (code && !/^unknownerror$/i.test(code) && code !== 'Error') {
    return code;
  }

  if (status) {
    return `Could not reach the bucket (HTTP ${status}). Check credentials, bucket name, and region.`;
  }

  return 'Could not reach the bucket. Check credentials, bucket name, and region.';
}
