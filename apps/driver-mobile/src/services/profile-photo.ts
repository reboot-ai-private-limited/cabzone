import * as ImagePicker from 'expo-image-picker';

export async function pickProfilePhoto(useCamera: boolean) {
  const permission = useCamera
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted)
    throw new Error('Allow camera or photo-library access in your device settings.');
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.5,
    base64: true,
  };
  const result = useCamera
    ? await ImagePicker.launchCameraAsync(options)
    : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  if (!asset.base64 || asset.base64.length > 819_200)
    throw new Error('Choose a photo smaller than 600 KB.');
  return { uri: asset.uri, dataUrl: `data:image/jpeg;base64,${asset.base64}` };
}
