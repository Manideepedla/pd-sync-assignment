import dotenv from "dotenv";
import type { PipedrivePerson, PipedriveContactInfo } from "./types/pipedrive";
import inputData from "./mappings/inputData.json";
import mappings from "./mappings/mappings.json";
import axios, { AxiosResponse } from "axios";

dotenv.config();


const apiKey = process.env.PIPEDRIVE_API_KEY;
const companyDomain = process.env.PIPEDRIVE_COMPANY_DOMAIN;

interface FieldMapping {
  pipedriveKey: string;
  inputKey: string;
}


interface PipedriveApiResponse<T> {
  success: boolean;
  data: T;
  additional_data?: any;
}

interface PipedrivePersonSearchResponse {
  success: boolean;
  data: {
    items: Array<{
      item: PipedrivePerson;
      result_score: number;
    }>;
  };
}


const getNestedValue = (obj: any, path: string): any => {
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : undefined;
  }, obj);
};


const formatContactInfo = (value: string, label: string = 'work', primary: boolean = true): PipedriveContactInfo[] => {
  if (!value) return [];
  return [{
    label,
    value,
    primary
  }];
};


const buildPersonPayload = (inputData: any, mappings: FieldMapping[]): Partial<PipedrivePerson> => {
  const payload: any = {};
  
  mappings.forEach((mapping: FieldMapping) => {
    const inputValue = getNestedValue(inputData, mapping.inputKey);
    
    if (inputValue !== undefined && inputValue !== null) {

      if (mapping.pipedriveKey === 'email' && typeof inputValue === 'string') {
        payload[mapping.pipedriveKey] = formatContactInfo(inputValue, 'work', true);
      } else if (mapping.pipedriveKey === 'phone' && typeof inputValue === 'string') {
        payload[mapping.pipedriveKey] = formatContactInfo(inputValue, 'work', true);
      } else {
        payload[mapping.pipedriveKey] = inputValue;
      }
    }
  });
  
  return payload;
};


const searchPersonByName = async (name: string): Promise<PipedrivePerson | null> => {
  try {
    if (!name || !apiKey || !companyDomain) {
      throw new Error('Missing required parameters for person search');
    }

    const searchUrl = `https://${companyDomain}.pipedrive.com/api/v1/persons/search`;
    const response: AxiosResponse<PipedrivePersonSearchResponse> = await axios.get(searchUrl, {
      params: {
        term: name,
        api_token: apiKey,
        exact_match: false,
        limit: 1
      }
    });

    if (response.data.success && response.data.data.items && response.data.data.items.length > 0) {
      const foundPerson = response.data.data.items[0].item;
      console.log(`Found existing person: ${foundPerson.name} (ID: ${foundPerson.id})`);
      return foundPerson;
    }

    console.log(`No existing person found with name: ${name}`);
    return null;
  } catch (error: any) {
    console.error('Error searching for person:', error.response?.data || error.message);
    throw new Error(`Failed to search for person: ${error.message}`);
  }
};


const createPerson = async (personData: Partial<PipedrivePerson>): Promise<PipedrivePerson> => {
  try {
    if (!apiKey || !companyDomain) {
      throw new Error('Missing API credentials');
    }

    const createUrl = `https://${companyDomain}.pipedrive.com/api/v1/persons`;
    const response: AxiosResponse<PipedriveApiResponse<PipedrivePerson>> = await axios.post(createUrl, personData, {
      params: {
        api_token: apiKey
      }
    });

    if (response.data.success) {
      console.log(`Successfully created person: ${response.data.data.name} (ID: ${response.data.data.id})`);
      return response.data.data;
    } else {
      throw new Error('Failed to create person in Pipedrive');
    }
  } catch (error: any) {
    console.error('Error creating person:', error.response?.data || error.message);
    throw new Error(`Failed to create person: ${error.message}`);
  }
};


const updatePerson = async (personId: number, personData: Partial<PipedrivePerson>): Promise<PipedrivePerson> => {
  try {
    if (!apiKey || !companyDomain) {
      throw new Error('Missing API credentials');
    }

    const updateUrl = `https://${companyDomain}.pipedrive.com/api/v1/persons/${personId}`;
    const response: AxiosResponse<PipedriveApiResponse<PipedrivePerson>> = await axios.put(updateUrl, personData, {
      params: {
        api_token: apiKey
      }
    });

    if (response.data.success) {
      console.log(`Successfully updated person: ${response.data.data.name} (ID: ${response.data.data.id})`);
      return response.data.data;
    } else {
      throw new Error('Failed to update person in Pipedrive');
    }
  } catch (error: any) {
    console.error('Error updating person:', error.response?.data || error.message);
    throw new Error(`Failed to update person: ${error.message}`);
  }
};


const syncPdPerson = async (): Promise<PipedrivePerson> => {
  try {

    if (!apiKey || !companyDomain) {
      throw new Error('Missing required environment variables: PIPEDRIVE_API_KEY or PIPEDRIVE_COMPANY_DOMAIN');
    }


    if (!inputData || Object.keys(inputData).length === 0) {
      throw new Error('Input data is empty or invalid');
    }

    if (!mappings || !Array.isArray(mappings) || mappings.length === 0) {
      throw new Error('Mappings configuration is empty or invalid');
    }

    console.log('Starting Pipedrive person synchronization...');
    console.log('Input data:', JSON.stringify(inputData, null, 2));
    console.log('Mappings:', JSON.stringify(mappings, null, 2));


    const nameMapping = mappings.find((mapping: FieldMapping) => mapping.pipedriveKey === 'name');
    if (!nameMapping) {
      throw new Error('No mapping found for "name" field - required for person identification');
    }


    const nameValue = getNestedValue(inputData, nameMapping.inputKey);
    if (!nameValue || typeof nameValue !== 'string') {
      throw new Error(`Invalid or missing name value for field: ${nameMapping.inputKey}`);
    }

    console.log(`Searching for person with name: "${nameValue}"`);


    const personPayload = buildPersonPayload(inputData, mappings);
    console.log('Built person payload:', JSON.stringify(personPayload, null, 2));


    const existingPerson = await searchPersonByName(nameValue);

    let resultPerson: PipedrivePerson;

    if (existingPerson) {

      console.log('Updating existing person...');
      resultPerson = await updatePerson(existingPerson.id, personPayload);
    } else {

      console.log('Creating new person...');
      resultPerson = await createPerson(personPayload);
    }

    console.log('Synchronization completed successfully!');
    return resultPerson;

  } catch (error: any) {

    console.error('Error in syncPdPerson:', error.message);
    
    if (error.response?.status === 401) {
      throw new Error('Authentication failed - please check your API key');
    } else if (error.response?.status === 403) {
      throw new Error('Access forbidden - please check your API permissions');
    } else if (error.response?.status === 429) {
      throw new Error('Rate limit exceeded - please try again later');
    } else if (error.response?.status >= 500) {
      throw new Error('Pipedrive server error - please try again later');
    } else if (error.code === 'ENOTFOUND') {
      throw new Error('Network error - please check your internet connection');
    }
    

    throw error;
  }
};


export { syncPdPerson };


const executSync = async () => {
  try {
    const pipedrivePerson = await syncPdPerson();
    console.log('\n=== FINAL RESULT ===');
    console.log('Synchronized person:', JSON.stringify(pipedrivePerson, null, 2));
  } catch (error: any) {
    console.error('\n=== SYNCHRONIZATION FAILED ===');
    console.error('Error:', error.message);
    process.exit(1);
  }
};


executSync();
