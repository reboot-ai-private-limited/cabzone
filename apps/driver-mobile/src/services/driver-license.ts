import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

const MAX_LICENSE_BYTES = 500 * 1024;

export interface SelectedDriverLicense {
  name: string;
  dataUrl: string;
}

export async function pickDriverLicense(label = 'Licence'): Promise<SelectedDriverLicense | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf', 'image/jpeg', 'image/png'],
    multiple: false,
    // Expo Go can deny reads from DocumentPicker's cache copy on Android; read the granted URI immediately.
    copyToCacheDirectory: Platform.OS !== 'android',
    base64: Platform.OS === 'web',
  });
  if (result.canceled) return null;

  const asset = result.assets[0];
  if (!asset) throw new Error('No file was selected.');
  const extension = asset.name.split('.').at(-1)?.toLowerCase();
  const mimeType =
    extension === 'pdf'
      ? 'application/pdf'
      : extension === 'jpg' || extension === 'jpeg'
        ? 'image/jpeg'
        : extension === 'png'
          ? 'image/png'
          : null;
  if (!mimeType) throw new Error('Select a PDF, JPG, JPEG, or PNG file.');
  if (asset.size !== undefined && asset.size > MAX_LICENSE_BYTES) {
    throw new Error(`${label} file must be 500 KB or smaller.`);
  }

  let encoded: string;
  if (Platform.OS === 'web') {
    if (!asset.base64) throw new Error('Could not read the selected file.');
    encoded = asset.base64;
  } else {
    const file = new File(asset.uri);
    if (file.size > MAX_LICENSE_BYTES) throw new Error(`${label} file must be 500 KB or smaller.`);
    encoded = await file.base64();
  }
  const decodedSize =
    Math.floor((encoded.length * 3) / 4) -
    (encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0);
  if (decodedSize === 0 || decodedSize > MAX_LICENSE_BYTES) {
    throw new Error(`${label} file must be 500 KB or smaller.`);
  }

  return { name: asset.name, dataUrl: `data:${mimeType};base64,${encoded}` };
}
