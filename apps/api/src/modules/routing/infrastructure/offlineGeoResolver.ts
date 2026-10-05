import type { GeoPoint } from '@cabzone/geo';
import { haversineDistanceM, isPointInIndia } from '@cabzone/geo';
import type { ResolvedLocationDetails } from '@cabzone/contracts';
import type { DestinationStateResolverPort } from '../domain/stateResolver.port.js';
import { getStateNameFromCode } from './indiaStateCodes.js';

export interface KnownPlace {
  name: string;
  stateCode: string;
  state: string;
  district?: string;
  lat: number;
  lng: number;
}

export interface StateBoundingBox {
  stateCode: string;
  state: string;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/**
 * Curated reference database of major Indian cities, transit hubs, and border towns.
 * Designed to provide immediate, highly accurate reverse geocoding offline without
 * requiring Google Maps API keys or third-party billing.
 */
export const KNOWN_INDIAN_PLACES: KnownPlace[] = [
  // --- West Bengal (Primary Cabzone Market) ---
  { name: 'Siliguri', stateCode: 'WB', state: 'West Bengal', district: 'Darjeeling', lat: 26.7141, lng: 88.4334 },
  { name: 'Siliguri', stateCode: 'WB', state: 'West Bengal', district: 'Darjeeling', lat: 26.7271, lng: 88.3953 },
  { name: 'Bagdogra', stateCode: 'WB', state: 'West Bengal', district: 'Darjeeling', lat: 26.6961, lng: 88.3228 },
  { name: 'Matigara', stateCode: 'WB', state: 'West Bengal', district: 'Darjeeling', lat: 26.7118, lng: 88.3750 },
  { name: 'Siliguri', stateCode: 'WB', state: 'West Bengal', district: 'Jalpaiguri', lat: 26.6833, lng: 88.4417 },
  { name: 'Jalpaiguri', stateCode: 'WB', state: 'West Bengal', district: 'Jalpaiguri', lat: 26.5405, lng: 88.7194 },
  { name: 'Mainaguri', stateCode: 'WB', state: 'West Bengal', district: 'Jalpaiguri', lat: 26.5667, lng: 88.8167 },
  { name: 'Dhupguri', stateCode: 'WB', state: 'West Bengal', district: 'Jalpaiguri', lat: 26.6000, lng: 89.0167 },
  { name: 'Malbazar', stateCode: 'WB', state: 'West Bengal', district: 'Jalpaiguri', lat: 26.8667, lng: 88.7500 },
  { name: 'Darjeeling', stateCode: 'WB', state: 'West Bengal', district: 'Darjeeling', lat: 27.0410, lng: 88.2663 },
  { name: 'Kurseong', stateCode: 'WB', state: 'West Bengal', district: 'Darjeeling', lat: 26.8814, lng: 88.2778 },
  { name: 'Kalimpong', stateCode: 'WB', state: 'West Bengal', district: 'Kalimpong', lat: 27.0667, lng: 88.4667 },
  { name: 'Mirik', stateCode: 'WB', state: 'West Bengal', district: 'Darjeeling', lat: 26.8900, lng: 88.1800 },
  { name: 'Islampur', stateCode: 'WB', state: 'West Bengal', district: 'Uttar Dinajpur', lat: 26.2644, lng: 88.1906 },
  { name: 'Dalkhola', stateCode: 'WB', state: 'West Bengal', district: 'Uttar Dinajpur', lat: 25.8556, lng: 87.8542 },
  { name: 'Raiganj', stateCode: 'WB', state: 'West Bengal', district: 'Uttar Dinajpur', lat: 25.6178, lng: 88.1253 },
  { name: 'Cooch Behar', stateCode: 'WB', state: 'West Bengal', district: 'Cooch Behar', lat: 26.3452, lng: 89.4482 },
  { name: 'Dinhata', stateCode: 'WB', state: 'West Bengal', district: 'Cooch Behar', lat: 26.1333, lng: 89.4667 },
  { name: 'Alipurduar', stateCode: 'WB', state: 'West Bengal', district: 'Alipurduar', lat: 26.4919, lng: 89.5271 },
  { name: 'Jaigaon', stateCode: 'WB', state: 'West Bengal', district: 'Alipurduar', lat: 26.8333, lng: 89.3833 },
  { name: 'Malda', stateCode: 'WB', state: 'West Bengal', district: 'Malda', lat: 25.0108, lng: 88.1411 },
  { name: 'Balurghat', stateCode: 'WB', state: 'West Bengal', district: 'Dakshin Dinajpur', lat: 25.2167, lng: 88.7667 },
  { name: 'Gangarampur', stateCode: 'WB', state: 'West Bengal', district: 'Dakshin Dinajpur', lat: 25.4000, lng: 88.5200 },
  { name: 'Farakka', stateCode: 'WB', state: 'West Bengal', district: 'Murshidabad', lat: 24.8100, lng: 87.9100 },
  { name: 'Berhampore', stateCode: 'WB', state: 'West Bengal', district: 'Murshidabad', lat: 24.1000, lng: 88.2500 },
  { name: 'Kolkata', stateCode: 'WB', state: 'West Bengal', district: 'Kolkata', lat: 22.5726, lng: 88.3639 },
  { name: 'Howrah', stateCode: 'WB', state: 'West Bengal', district: 'Howrah', lat: 22.5958, lng: 88.2636 },
  { name: 'Asansol', stateCode: 'WB', state: 'West Bengal', district: 'Paschim Bardhaman', lat: 23.6739, lng: 86.9524 },
  { name: 'Durgapur', stateCode: 'WB', state: 'West Bengal', district: 'Paschim Bardhaman', lat: 23.5204, lng: 87.3119 },
  { name: 'Bardhaman', stateCode: 'WB', state: 'West Bengal', district: 'Purba Bardhaman', lat: 23.2324, lng: 87.8615 },
  { name: 'Kharagpur', stateCode: 'WB', state: 'West Bengal', district: 'Paschim Medinipur', lat: 22.3400, lng: 87.3200 },
  { name: 'Medinipur', stateCode: 'WB', state: 'West Bengal', district: 'Paschim Medinipur', lat: 22.4200, lng: 87.3300 },
  { name: 'Haldia', stateCode: 'WB', state: 'West Bengal', district: 'Purba Medinipur', lat: 22.0667, lng: 88.0667 },

  // --- Bihar (Interstate Outstation border destinations) ---
  { name: 'Kishanganj', stateCode: 'BR', state: 'Bihar', district: 'Kishanganj', lat: 26.0984, lng: 87.9482 },
  { name: 'Bahadurganj', stateCode: 'BR', state: 'Bihar', district: 'Kishanganj', lat: 26.2700, lng: 87.8200 },
  { name: 'Thakurganj', stateCode: 'BR', state: 'Bihar', district: 'Kishanganj', lat: 26.4500, lng: 88.1300 },
  { name: 'Purnia', stateCode: 'BR', state: 'Bihar', district: 'Purnia', lat: 25.7771, lng: 87.4753 },
  { name: 'Kasba', stateCode: 'BR', state: 'Bihar', district: 'Purnia', lat: 25.8500, lng: 87.5300 },
  { name: 'Banmankhi', stateCode: 'BR', state: 'Bihar', district: 'Purnia', lat: 25.9000, lng: 87.1700 },
  { name: 'Katihar', stateCode: 'BR', state: 'Bihar', district: 'Katihar', lat: 25.5541, lng: 87.5714 },
  { name: 'Barsoi', stateCode: 'BR', state: 'Bihar', district: 'Katihar', lat: 25.6500, lng: 87.8900 },
  { name: 'Araria', stateCode: 'BR', state: 'Bihar', district: 'Araria', lat: 26.1500, lng: 87.5200 },
  { name: 'Forbesganj', stateCode: 'BR', state: 'Bihar', district: 'Araria', lat: 26.3000, lng: 87.2600 },
  { name: 'Jogbani', stateCode: 'BR', state: 'Bihar', district: 'Araria', lat: 26.4200, lng: 87.2500 },
  { name: 'Bhagalpur', stateCode: 'BR', state: 'Bihar', district: 'Bhagalpur', lat: 25.2425, lng: 86.9842 },
  { name: 'Patna', stateCode: 'BR', state: 'Bihar', district: 'Patna', lat: 25.5941, lng: 85.1376 },
  { name: 'Muzaffarpur', stateCode: 'BR', state: 'Bihar', district: 'Muzaffarpur', lat: 26.1209, lng: 85.3647 },
  { name: 'Darbhanga', stateCode: 'BR', state: 'Bihar', district: 'Darbhanga', lat: 26.1542, lng: 85.8918 },
  { name: 'Madhubani', stateCode: 'BR', state: 'Bihar', district: 'Madhubani', lat: 26.3500, lng: 86.0700 },
  { name: 'Gaya', stateCode: 'BR', state: 'Bihar', district: 'Gaya', lat: 24.7914, lng: 85.0002 },
  { name: 'Bodh Gaya', stateCode: 'BR', state: 'Bihar', district: 'Gaya', lat: 24.6961, lng: 84.9869 },
  { name: 'Samastipur', stateCode: 'BR', state: 'Bihar', district: 'Samastipur', lat: 25.8600, lng: 85.7800 },
  { name: 'Begusarai', stateCode: 'BR', state: 'Bihar', district: 'Begusarai', lat: 25.4200, lng: 86.1300 },
  { name: 'Saharsa', stateCode: 'BR', state: 'Bihar', district: 'Saharsa', lat: 25.8800, lng: 86.6000 },
  { name: 'Madhepura', stateCode: 'BR', state: 'Bihar', district: 'Madhepura', lat: 25.9200, lng: 86.7900 },
  { name: 'Supaul', stateCode: 'BR', state: 'Bihar', district: 'Supaul', lat: 26.1200, lng: 86.6000 },
  { name: 'Munger', stateCode: 'BR', state: 'Bihar', district: 'Munger', lat: 25.3700, lng: 86.4700 },
  { name: 'Bihar Sharif', stateCode: 'BR', state: 'Bihar', district: 'Nalanda', lat: 25.2000, lng: 85.5200 },
  { name: 'Rajgir', stateCode: 'BR', state: 'Bihar', district: 'Nalanda', lat: 25.0300, lng: 85.4200 },
  { name: 'Chhapra', stateCode: 'BR', state: 'Bihar', district: 'Saran', lat: 25.7800, lng: 84.7500 },
  { name: 'Siwan', stateCode: 'BR', state: 'Bihar', district: 'Siwan', lat: 26.2200, lng: 84.3600 },
  { name: 'Gopalganj', stateCode: 'BR', state: 'Bihar', district: 'Gopalganj', lat: 26.4700, lng: 84.4400 },
  { name: 'Motihari', stateCode: 'BR', state: 'Bihar', district: 'Purvi Champaran', lat: 26.6500, lng: 84.9100 },
  { name: 'Bettiah', stateCode: 'BR', state: 'Bihar', district: 'Pashchim Champaran', lat: 26.8000, lng: 84.5000 },
  { name: 'Sasaram', stateCode: 'BR', state: 'Bihar', district: 'Rohtas', lat: 24.9500, lng: 84.0200 },
  { name: 'Buxar', stateCode: 'BR', state: 'Bihar', district: 'Buxar', lat: 25.5600, lng: 83.9800 },

  // --- Sikkim (Interstate North destinations) ---
  { name: 'Gangtok', stateCode: 'SK', state: 'Sikkim', district: 'East Sikkim', lat: 27.3389, lng: 88.6065 },
  { name: 'Namchi', stateCode: 'SK', state: 'Sikkim', district: 'South Sikkim', lat: 27.1667, lng: 88.3500 },
  { name: 'Pelling', stateCode: 'SK', state: 'Sikkim', district: 'West Sikkim', lat: 27.3167, lng: 88.2333 },
  { name: 'Geyzing', stateCode: 'SK', state: 'Sikkim', district: 'West Sikkim', lat: 27.2800, lng: 88.2500 },
  { name: 'Mangan', stateCode: 'SK', state: 'Sikkim', district: 'North Sikkim', lat: 27.5000, lng: 88.5300 },
  { name: 'Ravangla', stateCode: 'SK', state: 'Sikkim', district: 'South Sikkim', lat: 27.3000, lng: 88.3600 },
  { name: 'Rangpo', stateCode: 'SK', state: 'Sikkim', district: 'Pakyong', lat: 27.1772, lng: 88.5312 },
  { name: 'Singtam', stateCode: 'SK', state: 'Sikkim', district: 'Gangtok', lat: 27.2340, lng: 88.4980 },
  { name: 'Jorethang', stateCode: 'SK', state: 'Sikkim', district: 'South Sikkim', lat: 27.1167, lng: 88.2833 },
  { name: 'Pakyong', stateCode: 'SK', state: 'Sikkim', district: 'Pakyong', lat: 27.2400, lng: 88.5900 },
  { name: 'Lachung', stateCode: 'SK', state: 'Sikkim', district: 'North Sikkim', lat: 27.6900, lng: 88.7400 },
  { name: 'Lachen', stateCode: 'SK', state: 'Sikkim', district: 'North Sikkim', lat: 27.7200, lng: 88.5500 },

  // --- Assam (Interstate East destinations) ---
  { name: 'Guwahati', stateCode: 'AS', state: 'Assam', district: 'Kamrup Metropolitan', lat: 26.1445, lng: 91.7362 },
  { name: 'Dispur', stateCode: 'AS', state: 'Assam', district: 'Kamrup Metropolitan', lat: 26.1400, lng: 91.7900 },
  { name: 'Silchar', stateCode: 'AS', state: 'Assam', district: 'Cachar', lat: 24.8333, lng: 92.7789 },
  { name: 'Dibrugarh', stateCode: 'AS', state: 'Assam', district: 'Dibrugarh', lat: 27.4728, lng: 94.9120 },
  { name: 'Jorhat', stateCode: 'AS', state: 'Assam', district: 'Jorhat', lat: 26.7509, lng: 94.2037 },
  { name: 'Tezpur', stateCode: 'AS', state: 'Assam', district: 'Sonitpur', lat: 26.6528, lng: 92.7926 },
  { name: 'Nagaon', stateCode: 'AS', state: 'Assam', district: 'Nagaon', lat: 26.3452, lng: 92.6840 },
  { name: 'Bongaigaon', stateCode: 'AS', state: 'Assam', district: 'Bongaigaon', lat: 26.5024, lng: 90.5562 },
  { name: 'Dhubri', stateCode: 'AS', state: 'Assam', district: 'Dhubri', lat: 26.0200, lng: 89.9800 },
  { name: 'Goalpara', stateCode: 'AS', state: 'Assam', district: 'Goalpara', lat: 26.1700, lng: 90.6200 },
  { name: 'Kokrajhar', stateCode: 'AS', state: 'Assam', district: 'Kokrajhar', lat: 26.4000, lng: 90.2700 },
  { name: 'Barpeta', stateCode: 'AS', state: 'Assam', district: 'Barpeta', lat: 26.3200, lng: 91.0000 },
  { name: 'Tinsukia', stateCode: 'AS', state: 'Assam', district: 'Tinsukia', lat: 27.5000, lng: 95.3600 },

  // --- Jharkhand ---
  { name: 'Ranchi', stateCode: 'JH', state: 'Jharkhand', district: 'Ranchi', lat: 23.3441, lng: 85.3096 },
  { name: 'Jamshedpur', stateCode: 'JH', state: 'Jharkhand', district: 'East Singhbhum', lat: 22.8046, lng: 86.2029 },
  { name: 'Dhanbad', stateCode: 'JH', state: 'Jharkhand', district: 'Dhanbad', lat: 23.7957, lng: 86.4304 },
  { name: 'Bokaro', stateCode: 'JH', state: 'Jharkhand', district: 'Bokaro', lat: 23.6693, lng: 86.1511 },
  { name: 'Deoghar', stateCode: 'JH', state: 'Jharkhand', district: 'Deoghar', lat: 24.4826, lng: 86.7000 },
  { name: 'Hazaribagh', stateCode: 'JH', state: 'Jharkhand', district: 'Hazaribagh', lat: 23.9930, lng: 85.3647 },
  { name: 'Giridih', stateCode: 'JH', state: 'Jharkhand', district: 'Giridih', lat: 24.1800, lng: 86.3000 },
  { name: 'Dumka', stateCode: 'JH', state: 'Jharkhand', district: 'Dumka', lat: 24.2600, lng: 87.2500 },
  { name: 'Sahibganj', stateCode: 'JH', state: 'Jharkhand', district: 'Sahibganj', lat: 25.2500, lng: 87.6500 },
  { name: 'Pakur', stateCode: 'JH', state: 'Jharkhand', district: 'Pakur', lat: 24.6300, lng: 87.8400 },

  // --- Odisha ---
  { name: 'Bhubaneswar', stateCode: 'OD', state: 'Odisha', district: 'Khordha', lat: 20.2961, lng: 85.8245 },
  { name: 'Cuttack', stateCode: 'OD', state: 'Odisha', district: 'Cuttack', lat: 20.4625, lng: 85.8828 },
  { name: 'Rourkela', stateCode: 'OD', state: 'Odisha', district: 'Sundargarh', lat: 22.2604, lng: 84.8536 },
  { name: 'Puri', stateCode: 'OD', state: 'Odisha', district: 'Puri', lat: 19.8135, lng: 85.8312 },
  { name: 'Balasore', stateCode: 'OD', state: 'Odisha', district: 'Balasore', lat: 21.4934, lng: 86.9135 },
  { name: 'Sambalpur', stateCode: 'OD', state: 'Odisha', district: 'Sambalpur', lat: 21.4669, lng: 83.9812 },

  // --- Delhi / NCR & Northern Hubs ---
  { name: 'Delhi', stateCode: 'DL', state: 'Delhi', district: 'Central Delhi', lat: 28.6139, lng: 77.2090 },
  { name: 'Noida', stateCode: 'UP', state: 'Uttar Pradesh', district: 'Gautam Buddha Nagar', lat: 28.5355, lng: 77.3910 },
  { name: 'Greater Noida', stateCode: 'UP', state: 'Uttar Pradesh', district: 'Gautam Buddha Nagar', lat: 28.4744, lng: 77.5040 },
  { name: 'Ghaziabad', stateCode: 'UP', state: 'Uttar Pradesh', district: 'Ghaziabad', lat: 28.6692, lng: 77.4538 },
  { name: 'Gurugram', stateCode: 'HR', state: 'Haryana', district: 'Gurugram', lat: 28.4595, lng: 77.0266 },
  { name: 'Faridabad', stateCode: 'HR', state: 'Haryana', district: 'Faridabad', lat: 28.4089, lng: 77.3178 },
  { name: 'Chandigarh', stateCode: 'CH', state: 'Chandigarh', district: 'Chandigarh', lat: 30.7333, lng: 76.7794 },
  { name: 'Ludhiana', stateCode: 'PB', state: 'Punjab', district: 'Ludhiana', lat: 30.9010, lng: 75.8573 },
  { name: 'Amritsar', stateCode: 'PB', state: 'Punjab', district: 'Amritsar', lat: 31.6340, lng: 74.8723 },
  { name: 'Dehradun', stateCode: 'UK', state: 'Uttarakhand', district: 'Dehradun', lat: 30.3165, lng: 78.0322 },
  { name: 'Haridwar', stateCode: 'UK', state: 'Uttarakhand', district: 'Haridwar', lat: 29.9457, lng: 78.1642 },
  { name: 'Shimla', stateCode: 'HP', state: 'Himachal Pradesh', district: 'Shimla', lat: 31.1048, lng: 77.1734 },
  { name: 'Srinagar', stateCode: 'JK', state: 'Jammu and Kashmir', district: 'Srinagar', lat: 34.0837, lng: 74.7973 },
  { name: 'Jammu', stateCode: 'JK', state: 'Jammu and Kashmir', district: 'Jammu', lat: 32.7266, lng: 74.8570 },
  { name: 'Leh', stateCode: 'LA', state: 'Ladakh', district: 'Leh', lat: 34.1526, lng: 77.5771 },

  // --- Uttar Pradesh ---
  { name: 'Lucknow', stateCode: 'UP', state: 'Uttar Pradesh', district: 'Lucknow', lat: 26.8467, lng: 80.9462 },
  { name: 'Kanpur', stateCode: 'UP', state: 'Uttar Pradesh', district: 'Kanpur Nagar', lat: 26.4499, lng: 80.3319 },
  { name: 'Varanasi', stateCode: 'UP', state: 'Uttar Pradesh', district: 'Varanasi', lat: 25.3176, lng: 82.9739 },
  { name: 'Prayagraj', stateCode: 'UP', state: 'Uttar Pradesh', district: 'Prayagraj', lat: 25.4358, lng: 81.8463 },
  { name: 'Agra', stateCode: 'UP', state: 'Uttar Pradesh', district: 'Agra', lat: 27.1767, lng: 78.0081 },
  { name: 'Gorakhpur', stateCode: 'UP', state: 'Uttar Pradesh', district: 'Gorakhpur', lat: 26.7606, lng: 83.3732 },
  { name: 'Ayodhya', stateCode: 'UP', state: 'Uttar Pradesh', district: 'Ayodhya', lat: 26.7922, lng: 82.1998 },

  // --- Western & Central India ---
  { name: 'Jaipur', stateCode: 'RJ', state: 'Rajasthan', district: 'Jaipur', lat: 26.9124, lng: 75.7873 },
  { name: 'Jodhpur', stateCode: 'RJ', state: 'Rajasthan', district: 'Jodhpur', lat: 26.2389, lng: 73.0243 },
  { name: 'Udaipur', stateCode: 'RJ', state: 'Rajasthan', district: 'Udaipur', lat: 24.5854, lng: 73.7125 },
  { name: 'Bhopal', stateCode: 'MP', state: 'Madhya Pradesh', district: 'Bhopal', lat: 23.2599, lng: 77.4126 },
  { name: 'Indore', stateCode: 'MP', state: 'Madhya Pradesh', district: 'Indore', lat: 22.7196, lng: 75.8577 },
  { name: 'Gwalior', stateCode: 'MP', state: 'Madhya Pradesh', district: 'Gwalior', lat: 26.2183, lng: 78.1828 },
  { name: 'Raipur', stateCode: 'CG', state: 'Chhattisgarh', district: 'Raipur', lat: 21.2514, lng: 81.6296 },
  { name: 'Ahmedabad', stateCode: 'GJ', state: 'Gujarat', district: 'Ahmedabad', lat: 23.0225, lng: 72.5714 },
  { name: 'Surat', stateCode: 'GJ', state: 'Gujarat', district: 'Surat', lat: 21.1702, lng: 72.8311 },
  { name: 'Vadodara', stateCode: 'GJ', state: 'Gujarat', district: 'Vadodara', lat: 22.3072, lng: 73.1812 },
  { name: 'Mumbai', stateCode: 'MH', state: 'Maharashtra', district: 'Mumbai', lat: 19.0760, lng: 72.8777 },
  { name: 'Pune', stateCode: 'MH', state: 'Maharashtra', district: 'Pune', lat: 18.5204, lng: 73.8567 },
  { name: 'Nagpur', stateCode: 'MH', state: 'Maharashtra', district: 'Nagpur', lat: 21.1458, lng: 79.0882 },
  { name: 'Panaji', stateCode: 'GA', state: 'Goa', district: 'North Goa', lat: 15.4909, lng: 73.8278 },

  // --- Southern India ---
  { name: 'Hyderabad', stateCode: 'TG', state: 'Telangana', district: 'Hyderabad', lat: 17.3850, lng: 78.4867 },
  { name: 'Bengaluru', stateCode: 'KA', state: 'Karnataka', district: 'Bengaluru Urban', lat: 12.9716, lng: 77.5946 },
  { name: 'Mysuru', stateCode: 'KA', state: 'Karnataka', district: 'Mysuru', lat: 12.2958, lng: 76.6394 },
  { name: 'Chennai', stateCode: 'TN', state: 'Tamil Nadu', district: 'Chennai', lat: 13.0827, lng: 80.2707 },
  { name: 'Coimbatore', stateCode: 'TN', state: 'Tamil Nadu', district: 'Coimbatore', lat: 11.0168, lng: 76.9558 },
  { name: 'Visakhapatnam', stateCode: 'AP', state: 'Andhra Pradesh', district: 'Visakhapatnam', lat: 17.6868, lng: 83.2185 },
  { name: 'Vijayawada', stateCode: 'AP', state: 'Andhra Pradesh', district: 'NTR', lat: 16.5062, lng: 80.6480 },
  { name: 'Kochi', stateCode: 'KL', state: 'Kerala', district: 'Ernakulam', lat: 9.9312, lng: 76.2673 },
  { name: 'Thiruvananthapuram', stateCode: 'KL', state: 'Kerala', district: 'Thiruvananthapuram', lat: 8.5241, lng: 76.9366 },

  // --- Other Northeast States ---
  { name: 'Shillong', stateCode: 'ML', state: 'Meghalaya', district: 'East Khasi Hills', lat: 25.5788, lng: 91.8933 },
  { name: 'Agartala', stateCode: 'TR', state: 'Tripura', district: 'West Tripura', lat: 23.8315, lng: 91.2868 },
  { name: 'Imphal', stateCode: 'MN', state: 'Manipur', district: 'Imphal West', lat: 24.8170, lng: 93.9368 },
  { name: 'Aizawl', stateCode: 'MZ', state: 'Mizoram', district: 'Aizawl', lat: 23.7271, lng: 92.7176 },
  { name: 'Kohima', stateCode: 'NL', state: 'Nagaland', district: 'Kohima', lat: 25.6751, lng: 94.1086 },
  { name: 'Itanagar', stateCode: 'AR', state: 'Arunachal Pradesh', district: 'Papum Pare', lat: 27.0844, lng: 93.6053 },
  { name: 'Port Blair', stateCode: 'AN', state: 'Andaman and Nicobar Islands', district: 'South Andaman', lat: 11.6234, lng: 92.7265 },
  { name: 'Puducherry', stateCode: 'PY', state: 'Puducherry', district: 'Puducherry', lat: 11.9416, lng: 79.8083 },
];

/**
 * State geographic bounding boxes used to resolve points that fall further away
 * from known city centers.
 */
export const STATE_BOUNDING_BOXES: StateBoundingBox[] = [
  // Sikkim: strictly bounded north of Darjeeling/Kalimpong
  { stateCode: 'SK', state: 'Sikkim', minLat: 27.08, maxLat: 28.15, minLng: 88.00, maxLng: 88.95 },
  // Bihar: west of Islampur/Mahananda basin
  { stateCode: 'BR', state: 'Bihar', minLat: 24.25, maxLat: 27.55, minLng: 83.30, maxLng: 88.16 },
  // West Bengal North (Siliguri, Jalpaiguri, Cooch Behar, Darjeeling, Dinajpur)
  { stateCode: 'WB', state: 'West Bengal', minLat: 24.50, maxLat: 27.25, minLng: 87.75, maxLng: 89.90 },
  // West Bengal South (Kolkata, Howrah, Bardhaman, Medinipur)
  { stateCode: 'WB', state: 'West Bengal', minLat: 21.50, maxLat: 24.50, minLng: 86.50, maxLng: 89.10 },
  // Assam: East of Cooch Behar / Sankosh river
  { stateCode: 'AS', state: 'Assam', minLat: 24.10, maxLat: 28.00, minLng: 89.70, maxLng: 96.05 },
  // Jharkhand: South of Bihar, West of Bengal
  { stateCode: 'JH', state: 'Jharkhand', minLat: 21.90, maxLat: 25.35, minLng: 83.30, maxLng: 87.90 },
  // Odisha
  { stateCode: 'OD', state: 'Odisha', minLat: 17.75, maxLat: 22.60, minLng: 81.35, maxLng: 87.55 },
  // Delhi
  { stateCode: 'DL', state: 'Delhi', minLat: 28.40, maxLat: 28.88, minLng: 76.84, maxLng: 77.35 },
  // Uttar Pradesh
  { stateCode: 'UP', state: 'Uttar Pradesh', minLat: 23.85, maxLat: 30.45, minLng: 77.05, maxLng: 84.65 },
  // Haryana
  { stateCode: 'HR', state: 'Haryana', minLat: 27.65, maxLat: 30.92, minLng: 74.45, maxLng: 77.60 },
  // Punjab
  { stateCode: 'PB', state: 'Punjab', minLat: 29.55, maxLat: 32.50, minLng: 73.85, maxLng: 76.95 },
  // Himachal Pradesh
  { stateCode: 'HP', state: 'Himachal Pradesh', minLat: 30.35, maxLat: 33.25, minLng: 75.60, maxLng: 79.05 },
  // Uttarakhand
  { stateCode: 'UK', state: 'Uttarakhand', minLat: 28.70, maxLat: 31.45, minLng: 77.55, maxLng: 81.05 },
  // Jammu & Kashmir
  { stateCode: 'JK', state: 'Jammu and Kashmir', minLat: 32.25, maxLat: 37.10, minLng: 73.75, maxLng: 77.50 },
  // Ladakh
  { stateCode: 'LA', state: 'Ladakh', minLat: 32.25, maxLat: 36.00, minLng: 75.50, maxLng: 80.50 },
  // Rajasthan
  { stateCode: 'RJ', state: 'Rajasthan', minLat: 23.05, maxLat: 30.20, minLng: 69.50, maxLng: 78.30 },
  // Madhya Pradesh
  { stateCode: 'MP', state: 'Madhya Pradesh', minLat: 21.05, maxLat: 26.85, minLng: 74.05, maxLng: 82.80 },
  // Chhattisgarh
  { stateCode: 'CG', state: 'Chhattisgarh', minLat: 17.75, maxLat: 24.10, minLng: 80.25, maxLng: 84.40 },
  // Gujarat
  { stateCode: 'GJ', state: 'Gujarat', minLat: 20.10, maxLat: 24.75, minLng: 68.15, maxLng: 74.50 },
  // Maharashtra
  { stateCode: 'MH', state: 'Maharashtra', minLat: 15.60, maxLat: 22.05, minLng: 72.60, maxLng: 80.90 },
  // Goa
  { stateCode: 'GA', state: 'Goa', minLat: 14.85, maxLat: 15.80, minLng: 73.65, maxLng: 74.35 },
  // Karnataka
  { stateCode: 'KA', state: 'Karnataka', minLat: 11.55, maxLat: 18.45, minLng: 74.05, maxLng: 78.60 },
  // Telangana
  { stateCode: 'TG', state: 'Telangana', minLat: 15.80, maxLat: 19.90, minLng: 77.20, maxLng: 81.80 },
  // Andhra Pradesh
  { stateCode: 'AP', state: 'Andhra Pradesh', minLat: 12.60, maxLat: 19.15, minLng: 76.75, maxLng: 84.75 },
  // Tamil Nadu
  { stateCode: 'TN', state: 'Tamil Nadu', minLat: 8.05, maxLat: 13.55, minLng: 76.25, maxLng: 80.35 },
  // Kerala
  { stateCode: 'KL', state: 'Kerala', minLat: 8.25, maxLat: 12.80, minLng: 74.85, maxLng: 77.40 },
  // Meghalaya
  { stateCode: 'ML', state: 'Meghalaya', minLat: 25.00, maxLat: 26.15, minLng: 89.80, maxLng: 92.85 },
  // Tripura
  { stateCode: 'TR', state: 'Tripura', minLat: 22.90, maxLat: 24.55, minLng: 91.15, maxLng: 92.35 },
  // Manipur
  { stateCode: 'MN', state: 'Manipur', minLat: 23.80, maxLat: 25.70, minLng: 92.95, maxLng: 94.80 },
  // Mizoram
  { stateCode: 'MZ', state: 'Mizoram', minLat: 21.95, maxLat: 24.55, minLng: 92.25, maxLng: 93.45 },
  // Nagaland
  { stateCode: 'NL', state: 'Nagaland', minLat: 25.10, maxLat: 27.05, minLng: 93.30, maxLng: 95.25 },
  // Arunachal Pradesh
  { stateCode: 'AR', state: 'Arunachal Pradesh', minLat: 26.45, maxLat: 29.50, minLng: 91.50, maxLng: 97.45 },
];

/**
 * High-performance, offline Indian geographic location and administrative boundary resolver.
 * Guaranteed to operate instantaneously with 0 external network requests and 0 API cost.
 */
export class OfflineIndiaGeoResolver implements DestinationStateResolverPort {
  async resolve(point: GeoPoint): Promise<string | null> {
    const loc = this.resolveLocationSync(point);
    return loc.stateCode;
  }

  async resolveLocation(point: GeoPoint): Promise<ResolvedLocationDetails> {
    return this.resolveLocationSync(point);
  }

  resolveLocationSync(point: GeoPoint): ResolvedLocationDetails {
    const indiaCheck = isPointInIndia(point);

    if (!indiaCheck.inside) {
      return {
        point,
        country: indiaCheck.country ?? 'Outside India',
        countryCode: indiaCheck.countryCode ?? 'XX',
        state: null,
        stateCode: null,
        city: null,
        formattedAddress: null,
      };
    }

    // 1. Find the geographically closest known city or hub
    let closestPlace: KnownPlace = KNOWN_INDIAN_PLACES[0]!;
    let minDistanceM = Number.POSITIVE_INFINITY;

    for (const place of KNOWN_INDIAN_PLACES) {
      const dist = haversineDistanceM(point, { lat: place.lat, lng: place.lng });
      if (dist < minDistanceM) {
        minDistanceM = dist;
        closestPlace = place;
      }
    }

    // 2. If closest hub is within 65 km, match directly to this city/district
    if (minDistanceM <= 65_000) {
      const stateName = getStateNameFromCode(closestPlace.stateCode) ?? closestPlace.state;
      return {
        point,
        country: 'India',
        countryCode: 'IN',
        state: stateName,
        stateCode: closestPlace.stateCode,
        city: closestPlace.name,
        district: closestPlace.district ?? closestPlace.name,
        formattedAddress: `${closestPlace.name}, ${stateName}, India`,
      };
    }

    // 3. If further out, test state bounding boxes to resolve the exact state
    const matchedStateBoxes = STATE_BOUNDING_BOXES.filter(
      (b) =>
        point.lat >= b.minLat &&
        point.lat <= b.maxLat &&
        point.lng >= b.minLng &&
        point.lng <= b.maxLng,
    );

    let chosenStateCode = closestPlace.stateCode;
    let chosenStateName = closestPlace.state;
    let chosenCityName = closestPlace.name;
    let chosenDistrict = closestPlace.district;

    if (matchedStateBoxes.length > 0) {
      // Find the closest city belonging specifically to one of the matched states
      const matchedCodes = new Set(matchedStateBoxes.map((b) => b.stateCode));
      const stateCandidates = KNOWN_INDIAN_PLACES.filter((p) => matchedCodes.has(p.stateCode));

      if (stateCandidates.length > 0) {
        let stateMinDist = Number.POSITIVE_INFINITY;
        let bestStatePlace = stateCandidates[0]!;

        for (const place of stateCandidates) {
          const dist = haversineDistanceM(point, { lat: place.lat, lng: place.lng });
          if (dist < stateMinDist) {
            stateMinDist = dist;
            bestStatePlace = place;
          }
        }

        chosenStateCode = bestStatePlace.stateCode;
        chosenStateName = getStateNameFromCode(bestStatePlace.stateCode) ?? bestStatePlace.state;
        chosenCityName = bestStatePlace.name;
        chosenDistrict = bestStatePlace.district;
        minDistanceM = stateMinDist;
      } else {
        const box = matchedStateBoxes[0]!;
        chosenStateCode = box.stateCode;
        chosenStateName = box.state;
      }
    } else {
      chosenStateName = getStateNameFromCode(chosenStateCode) ?? chosenStateName;
    }

    // If more than 80km from city center, label as region/area to be descriptive
    const displayCity = minDistanceM <= 80_000 ? chosenCityName : `${chosenCityName} Region`;

    return {
      point,
      country: 'India',
      countryCode: 'IN',
      state: chosenStateName,
      stateCode: chosenStateCode,
      city: displayCity,
      district: chosenDistrict ?? chosenCityName,
      formattedAddress: `${displayCity}, ${chosenStateName}, India`,
    };
  }
}
