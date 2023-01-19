import MultipartFormDataParser from '../multipart/MultipartFormDataParser';
import IWindow from '../../window/IWindow';
import Stream from 'stream';
import { URLSearchParams } from 'url';
import FormData from '../../form-data/FormData';
import Blob from '../../file/Blob';
import DOMException from '../../exception/DOMException';
import DOMExceptionNameEnum from '../../exception/DOMExceptionNameEnum';
import IRequestBody from '../types/IRequestBody';
import IResponseBody from '../types/IResponseBody';

/**
 * Fetch body utility.
 */
export default class FetchBodyUtility {
	/**
	 * Parses body and returns stream and type.
	 *
	 * Based on:
	 * https://github.com/node-fetch/node-fetch/blob/main/src/body.js (MIT)
	 *
	 * @param window Window.
	 * @param body Body.
	 * @returns Stream and type.
	 */
	public static getBodyStream(
		window: IWindow,
		body: IRequestBody | IResponseBody
	): { contentType: string; contentLength: number | null; stream: Stream.Readable } {
		if (body === null || body === undefined) {
			return { stream: null, contentType: null, contentLength: null };
		} else if (body instanceof URLSearchParams) {
			const bodyAsString = body.toString();
			return {
				stream: Stream.Readable.from(Buffer.from(bodyAsString)),
				contentType: null,
				contentLength: bodyAsString.length
			};
		} else if (body instanceof Blob) {
			return {
				stream: Stream.Readable.from((<Blob>body)._buffer),
				contentType: (<Blob>body).type,
				contentLength: body.size
			};
		} else if (Buffer.isBuffer(body)) {
			return { stream: Stream.Readable.from(body), contentType: null, contentLength: body.length };
		} else if (body instanceof ArrayBuffer) {
			return {
				stream: Stream.Readable.from(Buffer.from(body)),
				contentType: null,
				contentLength: body.byteLength
			};
		} else if (ArrayBuffer.isView(body)) {
			return {
				stream: Stream.Readable.from(Buffer.from(body.buffer, body.byteOffset, body.byteLength)),
				contentType: null,
				contentLength: body.byteLength
			};
		} else if (body instanceof Stream.Stream) {
			// Clones the body
			const stream = new Stream.PassThrough();
			body.pipe(<Stream.PassThrough>stream);
			return {
				stream,
				contentType: null,
				contentLength: null
			};
		} else if (body instanceof FormData) {
			return MultipartFormDataParser.formDataToStream(window, body);
		}

		const bodyAsString = String(body);
		return {
			stream: Stream.Readable.from(Buffer.from(bodyAsString)),
			contentType: null,
			contentLength: bodyAsString.length
		};
	}

	/**
	 * Consume and convert an entire Body to a Buffer.
	 *
	 * Based on:
	 * https://github.com/node-fetch/node-fetch/blob/main/src/body.js (MIT)
	 *
	 * @see https://fetch.spec.whatwg.org/#concept-body-consume-body
	 * @param body Body stream.
	 * @param [size] Size.
	 * @returns Promise.
	 */
	public static async consumeBodyStream(body: Stream.Readable | null, size = 0): Promise<Buffer> {
		if (body === null || !(body instanceof Stream.Stream)) {
			return Buffer.alloc(0);
		}

		const sizeError = new DOMException(
			`Content size as reached the limit "${size}".`,
			DOMExceptionNameEnum.invalidStateError
		);

		const chunks = [];
		let bytes = 0;

		for await (const chunk of body) {
			if (size && bytes + chunk.length > size) {
				if (typeof body['destroy'] === 'function') {
					body['destroy'](sizeError);
				}
				throw sizeError;
			}

			bytes += chunk.length;
			chunks.push(chunk);
		}

		if (
			(<Stream.Readable>body).readableEnded === false ||
			(<Stream.Readable>body)['_readableState']?.ended === false
		) {
			throw new DOMException(
				`Premature close of server response.`,
				DOMExceptionNameEnum.invalidStateError
			);
		}

		try {
			if (typeof chunks[0] === 'string') {
				return Buffer.from(chunks.join(''));
			}

			return Buffer.concat(chunks, bytes);
		} catch (error) {
			throw new DOMException(
				`Could not create Buffer from response body. Error: ${error.message}.`,
				DOMExceptionNameEnum.invalidStateError
			);
		}
	}
}