import { S3ObjectStorage } from './s3-object-storage';

type Sent = { constructor: { name: string }; input: Record<string, unknown> };

function fakeClient(responses: unknown[] = []) {
  const sent: Sent[] = [];
  const client = {
    send: vi.fn((cmd: Sent) => {
      sent.push(cmd);
      return Promise.resolve(responses.shift());
    }),
  };
  return { client, sent };
}

describe('S3ObjectStorage', () => {
  it('puts an encrypted object into the configured bucket', async () => {
    const { client, sent } = fakeClient();
    const storage = new S3ObjectStorage(client, 'fnt-private');
    await storage.put('drivers/abc/licence/1.pdf', Buffer.from('x'), 'application/pdf');

    expect(sent).toHaveLength(1);
    expect(sent[0].constructor.name).toBe('PutObjectCommand');
    expect(sent[0].input).toMatchObject({
      Bucket: 'fnt-private',
      Key: 'drivers/abc/licence/1.pdf',
      ContentType: 'application/pdf',
      ServerSideEncryption: 'AES256',
    });
  });

  it('reads an object back as a buffer', async () => {
    const { client } = fakeClient([
      { Body: { transformToByteArray: () => Promise.resolve(new Uint8Array([1, 2, 3])) } },
    ]);
    const storage = new S3ObjectStorage(client, 'b');
    const buf = await storage.get('drivers/x/v5c/1.png');
    expect([...buf]).toEqual([1, 2, 3]);
  });

  it('fails clearly when the object body is missing', async () => {
    const { client } = fakeClient([{}]);
    const storage = new S3ObjectStorage(client, 'b');
    await expect(storage.get('drivers/x/v5c/1.png')).rejects.toThrow('empty or missing');
  });

  it('deletes an object', async () => {
    const { client, sent } = fakeClient();
    await new S3ObjectStorage(client, 'b').delete('drivers/x/insurance/1.jpg');
    expect(sent[0].constructor.name).toBe('DeleteObjectCommand');
  });

  it.each([
    '/etc/passwd',
    '../secrets',
    'drivers/../../x',
    'a' + String.fromCharCode(92) + 'b',
    '',
  ])('refuses the unsafe key %j', async (key) => {
    const { client } = fakeClient();
    const storage = new S3ObjectStorage(client, 'b');
    await expect(storage.put(key, Buffer.from('x'), 'text/plain')).rejects.toThrow(
      'Invalid storage key',
    );
    expect(client.send).not.toHaveBeenCalled();
  });
});
